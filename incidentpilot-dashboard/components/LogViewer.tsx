"use client";
import { useEffect, useRef, useState } from "react";
import type { LogEvent } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { Card, Chip } from "./ui";

const LEVEL = { INFO: "text-muted", WARN: "text-warn", ERROR: "text-bad" } as const;
type F = "all" | "warn" | "error";

export default function LogViewer({ logs, cited, focus }: { logs: LogEvent[]; cited: string[]; focus: string | null }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("all");
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!focus) return;
    setQ(""); setF("all");
    const t = setTimeout(() => refs.current[focus]?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
    return () => clearTimeout(t);
  }, [focus]);

  const shown = logs.filter(
    (l) => (f === "all" || (f === "warn" ? l.level !== "INFO" : l.level === "ERROR")) &&
      `${l.id} ${l.service} ${l.message}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <Card title="Logs in the incident window" aside={cited.length ? "highlighted lines are cited" : `${logs.length} lines`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search logs" aria-label="Search logs"
          className="min-w-0 flex-1 rounded-md border border-line bg-raised px-2.5 py-1 text-sm placeholder:text-muted focus:border-info focus:outline-none" />
        <Chip on={f === "all"} onClick={() => setF("all")}>All</Chip>
        <Chip on={f === "warn"} onClick={() => setF("warn")}>Warnings+</Chip>
        <Chip on={f === "error"} onClick={() => setF("error")}>Errors</Chip>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {shown.map((l) => (
          <div key={l.id} ref={(el) => { refs.current[l.id] = el; }}
            className={`flex gap-2.5 border-t border-line px-1 py-2 font-mono text-[12.5px] first:border-t-0 ${
              focus === l.id ? "bg-warn/25 ring-1 ring-warn" : cited.includes(l.id) ? "bg-warn/10 shadow-[inset_3px_0_0_#E3A33B]" : ""}`}>
            <span className="w-14 shrink-0 text-muted">{l.id.replace("log-", "#")}</span>
            <span className="w-[58px] shrink-0 text-muted">{fmtTime(l.timestamp)}</span>
            <span className={`w-[42px] shrink-0 ${LEVEL[l.level]}`}>{l.level}</span>
            <span className="min-w-0 break-words"><span className="text-muted">{l.service}</span> {l.message}</span>
          </div>
        ))}
        {shown.length === 0 && <p className="py-3 text-xs text-muted">No log lines match.</p>}
      </div>
    </Card>
  );
}
