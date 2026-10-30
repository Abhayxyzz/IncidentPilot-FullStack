import type { Bundle, Incident, Investigation, LogEvent } from "./types";
import { mock } from "./mock-backend";

export interface Api {
  listIncidents(): Promise<Incident[]>;
  getBundle(id: string): Promise<Bundle>;
  startInvestigation(id: string): Promise<unknown>;
  approve(id: string, actionId: string, approver: string): Promise<unknown>;
  resetDemo(): Promise<unknown>;
  demo?: { trigger(): Promise<string>; setFailNext(v: boolean): void; failNext(): boolean };
}

// Override NEXT_PUBLIC_API_URL for local development. The hosted API is the default.
const BASE = (process.env.NEXT_PUBLIC_API_URL || "https://incidentpilot-56op.onrender.com").replace(/\/$/, "");
export const isLive = !!BASE;

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new Error(`Can’t reach the backend at ${BASE}. Check that it is running and that CORS allows this origin.`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// The only place that knows the backend's URLs. If your payloads differ from the DPR, adapt here.
const live: Api = {
  listIncidents: () => http<Incident[]>("/api/incidents"),
  async getBundle(id) {
    const [d, logs] = await Promise.all([http<any>(`/api/incidents/${id}`), http<LogEvent[]>(`/api/incidents/${id}/logs`)]);
    const incident: Incident = d.incident ?? d;
    const rawInvestigation = d.latest_investigation_id ? await http<Investigation & { stage?: number | string }>(`/api/investigations/${d.latest_investigation_id}`) : undefined;
    const investigation = rawInvestigation && {
      ...rawInvestigation,
      stage: typeof rawInvestigation.stage === "number"
        ? rawInvestigation.stage
        : rawInvestigation.status === "completed" ? 4 : rawInvestigation.status === "running" ? 1 : 0,
    };
    return {
      incident, logs, investigation,
      audit: d.audit_events ?? [],
      metric: d.metrics ?? { name: "p95 latency", series: [], tail: [], threshold: 1000 },
      recovered: incident.status === "resolved",
      recovery_note: d.recovery_note ?? "",
    };
  },
  startInvestigation: (id) => http(`/api/incidents/${id}/investigate`, { method: "POST" }),
  approve: (id, actionId, approver) => http(`/api/incidents/${id}/remediations/${actionId}/approve`, { method: "POST", body: JSON.stringify({ approver }) }),
  resetDemo: () => http("/api/demo/reset", { method: "POST" }),
};

export const api: Api = isLive ? live : mock;
