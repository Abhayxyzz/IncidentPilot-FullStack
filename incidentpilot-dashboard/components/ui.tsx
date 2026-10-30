import type { ButtonHTMLAttributes, ReactNode } from "react";

export const card = "rounded-xl border border-line bg-panel p-4";

export function Card({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${card} ${className}`}>
      <h2 className="mb-2.5 flex items-baseline justify-between text-sm font-semibold">
        {title}
        {aside && <span className="text-xs font-normal text-muted">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone = "" }: { label: string; value: string | number; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`my-0.5 font-mono text-3xl font-semibold ${tone}`}>{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}

export function Chip({ on, children, ...p }: { on: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p} className={`rounded-md border px-3 py-1 text-[13px] ${on ? "border-info bg-info/10 text-info" : "border-line bg-panel hover:border-muted"}`}>
      {children}
    </button>
  );
}
