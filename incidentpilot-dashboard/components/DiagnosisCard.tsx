import type { Bundle } from "@/lib/types";
import { Card } from "./ui";

export default function DiagnosisCard({ b, onEvidence }: { b: Bundle; onEvidence: (id: string) => void }) {
  const inv = b.investigation;
  const report = inv?.status === "completed" ? inv.report : undefined;

  if (inv?.status === "failed")
    return (
      <Card title="Likely cause">
        <div className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm">
          <p className="font-medium text-bad">Investigation failed</p>
          <p className="mt-1 text-muted">{inv.error ?? "The investigation stopped before a report was saved."}</p>
          <p className="mt-1 text-xs text-muted">Nothing was run on your systems. Start it again from the banner above.</p>
        </div>
      </Card>
    );
  if (!report)
    return (
      <Card title="Likely cause">
        <p className="text-xs text-muted">{inv?.status === "running" ? "Investigating. The report appears here when it passes validation." : "No report yet. Run the investigation to see the cause, evidence and alternatives."}</p>
      </Card>
    );

  const rc = report.root_cause;
  const similarIncidents = report.similar_incidents ?? [];
  const resolves = (id: string) => b.logs.some((l) => l.id === id) || id.startsWith("metric-");
  return (
    <Card title="Likely cause">
      <p className="text-sm">{rc.hypothesis}</p>
      <div className="mt-2.5 flex items-center gap-2 text-xs text-muted">
        <span>Confidence {Math.round(rc.confidence * 100)}%</span>
        <div className="h-[5px] flex-1 rounded bg-raised"><div className="h-full rounded bg-info" style={{ width: `${rc.confidence * 100}%` }} /></div>
      </div>
      <div className="mt-2.5">
        <div className="mb-1 text-xs text-muted">Evidence (click to jump to it)</div>
        <div className="flex flex-wrap gap-1.5">
          {rc.evidence_ids.map((e) =>
            resolves(e) ? (
              <button key={e} onClick={() => onEvidence(e)} className="rounded border border-line bg-raised px-1.5 py-px font-mono text-xs hover:border-warn">{e}</button>
            ) : (
              <span key={e} title="This ID does not match any stored log or metric" className="rounded border border-bad/60 px-1.5 py-px font-mono text-xs text-bad line-through">{e}</span>
            )
          )}
        </div>
      </div>
      <h3 className="mt-3 text-xs font-semibold">Other explanations</h3>
      <ul className="mt-0.5 list-disc pl-4 text-[13px] text-muted">{report.alternatives.map((a) => <li key={a}>{a}</li>)}</ul>
      <h3 className="mt-3 text-xs font-semibold">What this can’t tell you</h3>
      <ul className="mt-0.5 list-disc pl-4 text-[13px] text-muted">{report.limitations.map((a) => <li key={a}>{a}</li>)}</ul>
      {similarIncidents.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold">Similar past incident <span className="font-normal text-muted">(historical, not from this window)</span></h3>
          {similarIncidents.map((s) => (
            <p key={s.id} className="mt-0.5 text-[13px] text-muted"><span className="font-mono text-ink">{s.id}</span> {s.title}. {s.note}</p>
          ))}
        </>
      )}
      {b.recovered && <div className="mt-3 rounded-lg border border-good bg-good/10 p-2.5 text-[13px] text-good">Recovered. {b.recovery_note}</div>}
    </Card>
  );
}
