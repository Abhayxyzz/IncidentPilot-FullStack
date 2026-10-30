"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, isLive } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { STAGES, type Bundle, type Incident, type IncidentStatus, type Severity } from "@/lib/types";
import ServiceGraph from "./ServiceGraph";
import LatencyChart from "./LatencyChart";
import LogViewer from "./LogViewer";
import DiagnosisCard from "./DiagnosisCard";
import DemoControls from "./DemoControls";
import { Card, Chip, Kpi, card } from "./ui";

const SEV: Record<Severity, string> = { critical: "SEV-1", high: "SEV-2", medium: "SEV-3" };
const EDGE: Record<Severity, string> = { critical: "border-l-bad", high: "border-l-warn", medium: "border-l-info" };
const GROUPS: [IncidentStatus, string][] = [
  ["open", "Open"], ["investigating", "Investigating"], ["action_pending", "Awaiting approval"], ["monitoring", "Verifying recovery"], ["resolved", "Resolved"],
];
const STATUS_LABEL = Object.fromEntries(GROUPS) as Record<IncidentStatus, string>;
const POLL_MS = isLive ? 2000 : 1000;

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => setT(new Date().toISOString().slice(11, 19) + " UTC");
    f();
    const h = setInterval(f, 1000);
    return () => clearInterval(h);
  }, []);
  return <span className="font-mono text-xs text-muted">{t}</span>;
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [b, setB] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fSvc, setFSvc] = useState("all");
  const [fSev, setFSev] = useState<"all" | Severity>("all");
  const [focus, setFocus] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [approver, setApprover] = useState("on-call engineer");
  const [loaded, setLoaded] = useState(false);
  const selRef = useRef<string | null>(null);
  selRef.current = selId;

  const refresh = useCallback(async () => {
    try {
      const list = await api.listIncidents();
      setIncidents(list);
      const id = selRef.current ?? list[0]?.id ?? null;
      if (id && !selRef.current) setSelId(id);
      if (id) {
        const bundle = await api.getBundle(id);
        if (id === selRef.current || !selRef.current) setB(bundle); // ignore a stale response after switching
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const h = setInterval(refresh, POLL_MS);
    return () => clearInterval(h);
  }, [refresh]);

  useEffect(() => { if (selId) refresh(); }, [selId, refresh]);

  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => setFocus(null), 2500);
    return () => clearTimeout(t);
  }, [focus]);

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); setError(null); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
  };

  const inv = b?.investigation;
  const report = inv?.status === "completed" ? inv.report : undefined;
  const action = report?.recommendations[0];
  const status = b?.incident.status;
  const active = incidents.filter((i) => i.status !== "resolved");
  const pending = incidents.filter((i) => i.status === "action_pending").length;
  const resolved = incidents.length - active.length;
  const sevText = (["critical", "high", "medium"] as Severity[]).filter((s) => active.some((i) => i.severity === s)).map((s) => SEV[s]).join(", ") || "none open";
  const services = Array.from(new Set(incidents.map((i) => i.service)));
  const shown = incidents.filter((i) => (fSvc === "all" || i.service === fSvc) && (fSev === "all" || i.severity === fSev));
  const evIds = report?.root_cause.evidence_ids ?? [];
  const evOk = b ? evIds.filter((e) => b.logs.some((l) => l.id === e) || e.startsWith("metric-")).length : 0;
  const errs = b?.logs.filter((l) => l.level === "ERROR").length ?? 0;
  const warns = b?.logs.filter((l) => l.level === "WARN").length ?? 0;
  const cited = evIds.filter((e) => e.startsWith("log-"));
  const stage = inv?.stage ?? 0;

  if (!loaded) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading incidents…</div>;

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-panel px-5 py-3">
        <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-bad text-sm font-bold text-bg">IP</div>
        <span className="text-base font-semibold">IncidentPilot</span>
        <span className={`inline-flex items-center gap-2 rounded-full border border-line px-3 py-0.5 text-xs ${active.length ? "text-bad" : "text-good"}`}>
          <i className="h-[7px] w-[7px] rounded-full bg-current" />
          {active.length ? `${active.length} active incident${active.length > 1 ? "s" : ""}` : "All systems nominal"}
        </span>
        <span className="flex-1" />
        <span className={`inline-flex items-center gap-2 rounded-full border border-line px-3 py-0.5 text-xs ${isLive ? "text-good" : "text-warn"}`}>
          <i className="h-[7px] w-[7px] rounded-full bg-current" />{isLive ? "Connected to API" : "Demo data, not live"}
        </span>
        <Clock />
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-bad/50 bg-bad/10 px-5 py-2 text-sm text-bad">
          <span>{error}</span>
          <button onClick={refresh} className="rounded border border-bad/60 px-2.5 py-0.5 text-xs hover:bg-bad/10">Try again</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
        <span className="text-xs text-muted">Service</span>
        {["all", ...services].map((s) => <Chip key={s} on={fSvc === s} onClick={() => setFSvc(s)}>{s === "all" ? "All services" : s}</Chip>)}
        <span className="ml-3 text-xs text-muted">Severity</span>
        {(["all", "critical", "high", "medium"] as const).map((s) => <Chip key={s} on={fSev === s} onClick={() => setFSev(s)}>{s === "all" ? "All" : SEV[s]}</Chip>)}
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pt-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Active incidents" value={active.length} sub={sevText} tone={active.length ? "text-bad" : "text-good"} />
        <Kpi label="Time to diagnosis" value={inv?.duration_s ? `${inv.duration_s.toFixed(1)} s` : "–"} sub="selected incident, trigger to report" />
        <Kpi label="Evidence resolved" value={report ? `${evOk}/${evIds.length}` : "–"} sub="cited IDs found in stored data" tone={report && evOk < evIds.length ? "text-bad" : ""} />
        <Kpi label="Awaiting approval" value={pending} sub="no action runs without you" tone={pending ? "text-warn" : ""} />
        <Kpi label="Resolved" value={resolved} sub="each checked by a health signal" tone="text-good" />
      </div>

      {b && (
        <div className="mx-5 mt-4 flex flex-col gap-3 rounded-xl border border-line bg-panel px-4 py-3.5 md:flex-row md:items-center md:gap-4">
          <span className="whitespace-nowrap rounded-md border border-line bg-raised px-2.5 py-0.5 text-xs text-info">Copilot</span>
          <div className="flex-1 text-sm">
            {b.recovered ? (
              <><p className="font-medium">Recovered. {b.recovery_note}</p><p className="text-xs text-muted">Verified by the health check and saved to the timeline.</p></>
            ) : inv?.status === "failed" ? (
              <><p className="font-medium text-bad">The investigation failed.</p><p className="text-xs text-muted">{inv.error} Nothing was changed. You can run it again.</p></>
            ) : report ? (
              <><p className="font-medium">{report.summary}. <span className="font-normal text-muted">Confidence {Math.round(report.root_cause.confidence * 100)}%</span></p>
                <p className="text-xs text-muted">Suggested fix: {action?.title}. Nothing runs until you approve it.</p></>
            ) : inv?.status === "running" || inv?.status === "queued" ? (
              <><p className="font-medium">Investigating {b.incident.id}…</p><p className="text-xs text-muted">{STAGES[Math.min(stage, 3)]}</p></>
            ) : (
              <><p className="font-medium">{errs} errors and {warns} warnings on {b.incident.service} since {fmtTime(b.incident.started_at)}.</p>
                <p className="text-xs text-muted">Start an investigation to gather evidence and draft a root cause.</p></>
            )}
          </div>
          {(!inv || inv.status === "failed") && (
            <button onClick={() => run(() => api.startInvestigation(b.incident.id))} className="whitespace-nowrap rounded-md bg-info px-3.5 py-2 text-sm font-medium text-bg">
              {inv?.status === "failed" ? "Try again" : "Investigate"}
            </button>
          )}
          {status === "action_pending" && action && (
            <button onClick={() => setConfirming(true)} className="whitespace-nowrap rounded-md bg-good px-3.5 py-2 text-sm font-medium text-bg">Review fix</button>
          )}
          {status === "monitoring" && <span className="text-xs text-muted">Running the health check…</span>}
        </div>
      )}

      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[290px_minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card title="Incident board" aside={`${shown.length} shown`}>
            {GROUPS.map(([st, label]) => {
              const items = shown.filter((i) => i.status === st);
              if (!items.length) return null;
              return (
                <div key={st}>
                  <div className="mb-1.5 mt-3 text-xs text-muted first:mt-0">{label}</div>
                  {items.map((i) => (
                    <button key={i.id} onClick={() => setSelId(i.id)} aria-current={selId === i.id}
                      className={`mb-2 block w-full rounded-lg border border-l-[3px] bg-raised px-3 py-2 text-left ${EDGE[i.severity]} ${selId === i.id ? "border-info" : "border-line"}`}>
                      <div className="flex justify-between text-xs text-muted">
                        <span><span className="mr-1.5 rounded border border-line bg-panel px-1.5 py-px font-mono text-[11px]">{SEV[i.severity]}</span>{i.id}</span>
                        <span>{i.service}</span>
                      </div>
                      <div className="mt-1 text-sm font-medium">{i.title}</div>
                    </button>
                  ))}
                </div>
              );
            })}
            {shown.length === 0 && <p className="text-xs text-muted">No incidents match these filters.</p>}
          </Card>

          <Card title="Investigation" aside={b?.incident.id}>
            <ol className="space-y-2.5">
              {STAGES.map((s, n) => {
                const st = n < stage ? "done" : inv?.status === "running" && n === stage ? "run" : inv?.status === "failed" && n === stage ? "fail" : "wait";
                return (
                  <li key={s} className="flex items-center gap-2.5 text-sm">
                    <span className={`grid h-[18px] w-[18px] place-items-center rounded-full border text-[10px] text-bg ${
                      st === "done" ? "border-good bg-good" : st === "run" ? "animate-pulse border-info" : st === "fail" ? "border-bad bg-bad" : "border-line"}`}>
                      {st === "done" ? "✓" : st === "fail" ? "!" : ""}
                    </span>
                    <span className={st === "wait" ? "text-muted" : ""}>{s}</span>
                  </li>
                );
              })}
            </ol>
          </Card>

          <DemoControls onTrigger={(id) => { setSelId(id); setB(null); refresh(); }} onReset={() => { setSelId(null); setB(null); refresh(); }} />
        </div>

        {b ? (
          <>
            <div className="space-y-4">
              <section className={`${card} flex flex-wrap items-center gap-2.5`}>
                <h1 className="text-lg font-semibold">{b.incident.title}</h1>
                <span className="rounded border border-line bg-panel px-1.5 py-px font-mono text-[11px]">{SEV[b.incident.severity]}</span>
                <span className="text-xs text-muted">{STATUS_LABEL[b.incident.status]}, started {fmtTime(b.incident.started_at)}</span>
              </section>
              <Card title="Service dependency map" aside={`${b.incident.service} affected`}>
                <ServiceGraph service={b.incident.service} suspect={report ? b.incident.suspect : undefined} recovered={b.recovered} />
              </Card>
              <section className={`${card} ${focus?.startsWith("metric-") ? "ring-1 ring-warn" : ""}`}>
                <h2 className="mb-2.5 flex items-baseline justify-between text-sm font-semibold">{b.metric.name}<span className="text-xs font-normal text-muted">log scale, 30 s steps</span></h2>
                <LatencyChart values={b.metric.series} tail={b.metric.tail} recovered={b.recovered} threshold={b.metric.threshold} />
              </section>
              <LogViewer logs={b.logs} cited={cited} focus={focus} />
            </div>

            <div className="space-y-4 md:col-span-2 xl:col-span-1">
              <DiagnosisCard b={b} onEvidence={setFocus} />
              <Card title="Incident timeline" aside={status && status !== "open" && status !== "resolved" ? "updating" : ""}>
                <ol className="space-y-2.5 text-sm">
                  {[...b.audit].reverse().map((a) => (
                    <li key={a.id} className="flex items-start gap-2.5">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-info" />
                      <span className="mt-0.5 w-[62px] shrink-0 font-mono text-xs text-muted">{fmtTime(a.created_at)}</span>
                      <span>{a.text}{a.actor !== "system" && <span className="text-muted"> ({a.actor})</span>}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted md:col-span-1">{incidents.length ? "Loading incident…" : "No incidents yet. Trigger one from the demo controls."}</p>
        )}
      </div>

      {confirming && action && b && (
        <div className="fixed inset-0 z-10 grid place-items-center bg-black/65 p-4" onClick={() => setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="dlg" className="w-full max-w-md rounded-xl border border-line bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <h2 id="dlg" className="text-base font-semibold">Run {action.action_id}?</h2>
            <p className="mt-2 text-sm">{action.description}</p>
            <p className="mt-1 text-xs text-muted">Risk: {action.risk}</p>
            <label className="mt-3 block text-xs text-muted">Approved by
              <input value={approver} onChange={(e) => setApprover(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-raised px-2.5 py-1.5 text-sm text-ink focus:border-info focus:outline-none" />
            </label>
            <p className="mt-3 text-xs text-muted">Only fixed, reviewed actions can run here. Nothing the model wrote is executed, and this approval goes in the timeline.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button autoFocus onClick={() => setConfirming(false)} className="rounded-md border border-line px-3.5 py-1.5 text-sm hover:bg-raised">Cancel</button>
              <button disabled={!approver.trim()} onClick={() => { setConfirming(false); run(() => api.approve(b.incident.id, action.action_id, approver.trim())); }}
                className="rounded-md bg-good px-3.5 py-1.5 text-sm font-medium text-bg disabled:opacity-40">Approve and run</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
