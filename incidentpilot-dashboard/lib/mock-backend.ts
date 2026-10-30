// In-memory stand-in for the FastAPI backend. Same shapes as the real API, so the UI never knows the difference.
import type { AuditEvent, Bundle, Incident, Investigation, Level, LogEvent, Recommendation, Report, Severity } from "./types";
import { nowLabel } from "./format";

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
type Row = [string, string, Level, string, string];
type Tpl = {
  title: string; severity: Severity; service: string; suspect: string; started: string; rows: Row[];
  series: number[]; tail: number[]; recovered: string; report: Report;
};
const rec = (action_id: string, title: string, description: string): Recommendation => ({ action_id, title, risk: "low", requires_approval: true, description });

const TPL: Record<string, Tpl> = {
  pool: {
    title: "Checkout returning 500s", severity: "critical", service: "api-service", suspect: "postgres", started: "14:02:47",
    rows: [
      ["log-101", "14:02:04", "INFO", "api-service", "GET /orders 200 41ms"],
      ["log-102", "14:02:31", "WARN", "api-service", "connection pool at 18/20, waiting 240ms"],
      ["log-103", "14:02:47", "ERROR", "api-service", "QueuePool limit of size 20 reached, connection timed out after 30s"],
      ["log-104", "14:02:48", "ERROR", "api-service", "POST /checkout 500 30012ms"],
      ["log-105", "14:02:52", "WARN", "postgres", "20 of 20 client connections in use for role app_rw"],
      ["log-106", "14:03:10", "ERROR", "api-service", "POST /checkout 500 30009ms"],
    ],
    series: [180, 190, 175, 210, 260, 480, 1200, 3400, 8800, 24000, 30000, 30000], tail: [2100, 640, 210, 190],
    recovered: "p95 latency is back to 190 ms, under the 1 s threshold. Error rate is 0%.",
    report: {
      summary: "Database connection pool is exhausted",
      root_cause: { hypothesis: "The API’s database pool (20 connections) is full. Checkout requests wait 30 seconds for a free connection, then fail with a 500.", confidence: 0.86, evidence_ids: ["log-103", "log-105", "metric-17"] },
      affected_services: ["api-service", "postgres"],
      alternatives: ["A slow query is holding connections open", "A connection leak in the checkout handler"],
      recommendations: [rec("sim-reset-pool", "Reset the simulated connection pool", "Drops idle and stuck connections in the demo pool and lets it refill. Runs a fixed, reviewed code path.")],
      limitations: ["Based on a 5-minute seeded window", "No slow-query log, so a leak can’t be ruled out"],
      similar_incidents: [{ id: "INC-1987", title: "Pool exhausted after a traffic spike", note: "Fixed by resetting the pool, resolved in 6 minutes. Seeded example of historical evidence." }],
    },
  },
  cache: {
    title: "Cache hit ratio fell to 31%", severity: "medium", service: "redis", suspect: "redis", started: "14:11:20",
    rows: [
      ["log-201", "14:11:02", "INFO", "api-service", "deploy 4f2c9 rolled out"],
      ["log-202", "14:11:20", "WARN", "redis", "keyspace_misses rising, hit ratio 0.31"],
      ["log-203", "14:11:41", "WARN", "redis", "evicted_keys=0, expired_keys=18204 in 30s"],
    ],
    series: [90, 95, 92, 140, 380, 620, 700, 690], tail: [300, 120, 95],
    recovered: "Cache hit ratio is back to 94% and p95 latency is 95 ms.",
    report: {
      summary: "Cache keys expired together after a deploy",
      root_cause: { hypothesis: "Most cache keys expired together right after the deploy, so requests fell through to the database.", confidence: 0.64, evidence_ids: ["log-201", "log-203"] },
      affected_services: ["redis", "api-service"],
      alternatives: ["Cache key format changed in the deploy", "Memory pressure (ruled out: no evictions)"],
      recommendations: [rec("sim-warm-cache", "Warm the simulated cache", "Preloads the hot keys into the demo cache. Runs a fixed, reviewed code path.")],
      limitations: ["Only three log lines in the window", "Confidence is moderate, review before acting"],
      similar_incidents: [{ id: "INC-1954", title: "Cold cache after a release", note: "Warming the cache fixed it. Seeded example of historical evidence." }],
    },
  },
  worker: {
    title: "Order worker backlog growing", severity: "high", service: "orders-worker", suspect: "redis", started: "Oct 24, 09:41",
    rows: [
      ["log-301", "09:41:12", "WARN", "orders-worker", "queue depth 4,812 and rising"],
      ["log-302", "09:41:30", "ERROR", "orders-worker", "redis: BRPOP timeout, retrying (3/5)"],
      ["log-303", "09:42:05", "INFO", "redis", "client reconnect storm, 212 connections in 10s"],
    ],
    series: [60, 70, 65, 400, 1500, 2600, 2900], tail: [800, 120, 70],
    recovered: "Queue depth drained to 0 within 4 minutes.",
    report: {
      summary: "Redis reconnect storm stalled the worker",
      root_cause: { hypothesis: "A Redis reconnect storm stalled the worker’s queue reads, so the backlog built up.", confidence: 0.78, evidence_ids: ["log-302", "log-303"] },
      affected_services: ["orders-worker", "redis"], alternatives: ["Worker crash loop"],
      recommendations: [rec("sim-restart-worker", "Restart the simulated worker", "Restarts the demo worker process.")],
      limitations: ["No Redis server logs for the window"], similar_incidents: [],
    },
  },
};

type Meta = { incident: Incident; tpl: Tpl; logs: LogEvent[]; audit: AuditEvent[]; inv?: Investigation; recovered: boolean };
let db = new Map<string, Meta>();
let failNext = false, seq = 2044, aSeq = 0, iSeq = 0;

function log(m: Meta, event_type: string, text: string, actor = "system", at = nowLabel()) {
  m.audit.push({ id: `a-${++aSeq}`, incident_id: m.incident.id, created_at: at, event_type, actor, text });
}
function make(id: string, key: string, started?: string): Meta {
  const tpl = TPL[key];
  const m: Meta = {
    tpl, recovered: false, audit: [],
    logs: tpl.rows.map(([lid, timestamp, level, service, message]) => ({ id: lid, incident_id: id, timestamp, level, service, message })),
    incident: { id, title: tpl.title, severity: tpl.severity, status: "open", service: tpl.service, suspect: tpl.suspect, started_at: started ?? tpl.started },
  };
  log(m, "incident_opened", "Incident opened from alert", "system", m.incident.started_at);
  return m;
}
function seed() {
  db = new Map();
  db.set("INC-2041", make("INC-2041", "pool"));
  db.set("INC-2043", make("INC-2043", "cache"));
  const w = make("INC-2038", "worker");
  w.recovered = true; w.incident.status = "resolved"; w.incident.resolved_at = "09:49:02";
  w.inv = { investigation_id: "inv-0", incident_id: "INC-2038", status: "completed", stage: 4, duration_s: 4.4, report: w.tpl.report };
  w.audit.push(
    { id: "a-h1", incident_id: "INC-2038", created_at: "09:43:40", event_type: "report_saved", actor: "system", text: "Report validated and saved" },
    { id: "a-h2", incident_id: "INC-2038", created_at: "09:44:55", event_type: "action_approved", actor: "priya", text: "Approved sim-restart-worker" },
    { id: "a-h3", incident_id: "INC-2038", created_at: "09:49:02", event_type: "recovery_verified", actor: "system", text: "Recovery check passed" },
  );
  db.set(w.incident.id, w);
}
seed();
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const mock = {
  async listIncidents(): Promise<Incident[]> { await wait(); return copy([...db.values()].map((m) => m.incident)); },
  async getBundle(id: string): Promise<Bundle> {
    await wait();
    const m = db.get(id);
    if (!m) throw new Error(`Incident ${id} not found.`);
    return copy({ incident: m.incident, logs: m.logs, audit: m.audit, investigation: m.inv, recovered: m.recovered, recovery_note: m.tpl.recovered, metric: { name: "p95 latency", series: m.tpl.series, tail: m.tpl.tail, threshold: 1000 } });
  },
  async startInvestigation(id: string) {
    await wait();
    const m = db.get(id);
    if (!m) throw new Error(`Incident ${id} not found.`);
    if (m.inv?.status === "running") return; // duplicate trigger is a no-op
    const t0 = Date.now();
    m.inv = { investigation_id: `inv-${++iSeq}`, incident_id: id, status: "running", stage: 0 };
    m.incident.status = "investigating";
    log(m, "investigation_started", "Investigation started");
    [1, 2, 3].forEach((n) => setTimeout(() => { if (m.inv?.status === "running") m.inv.stage = n; }, n * 1100));
    setTimeout(() => {
      if (failNext) {
        failNext = false;
        m.inv = { ...m.inv!, status: "failed", error: "The language model timed out after 30 s. No report was saved." };
        m.incident.status = "open";
        log(m, "investigation_failed", "Investigation failed: model timeout");
      } else {
        m.inv = { ...m.inv!, status: "completed", stage: 4, duration_s: (Date.now() - t0) / 1000, report: m.tpl.report };
        m.incident.status = "action_pending";
        log(m, "report_saved", "Report validated and saved");
      }
    }, 4400);
  },
  async approve(id: string, actionId: string, approver: string) {
    await wait();
    const m = db.get(id);
    if (!m?.inv?.report) throw new Error("There is no report to act on yet.");
    if (!m.inv.report.recommendations.some((r) => r.action_id === actionId)) throw new Error(`Unknown action "${actionId}". Nothing was run.`);
    if (m.incident.status !== "action_pending") return; // already approved
    m.incident.status = "monitoring";
    log(m, "action_approved", `Approved ${actionId}`, approver);
    setTimeout(() => {
      m.recovered = true; m.incident.status = "resolved"; m.incident.resolved_at = nowLabel();
      log(m, "recovery_verified", "Recovery check passed");
    }, 1800);
  },
  async resetDemo() { await wait(); seed(); failNext = false; seq = 2044; },
  demo: {
    async trigger(): Promise<string> {
      await wait();
      const id = `INC-${seq++}`;
      db.set(id, make(id, "pool", nowLabel()));
      return id;
    },
    setFailNext(v: boolean) { failNext = v; },
    failNext: () => failNext,
  },
};
