"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Card } from "./ui";

export default function DemoControls({ onTrigger, onReset }: { onTrigger: (id: string) => void; onReset: () => void }) {
  const [fail, setFail] = useState(api.demo?.failNext() ?? false);
  const btn = "w-full rounded-md border border-line px-3 py-1.5 text-left text-sm hover:bg-raised";
  return (
    <Card title="Demo controls" aside="for rehearsals">
      {api.demo && (
        <>
          <button className={btn} onClick={async () => onTrigger(await api.demo!.trigger())}>Trigger the checkout failure</button>
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={fail} onChange={(e) => { setFail(e.target.checked); api.demo!.setFailNext(e.target.checked); }} />
            <span>Make the next investigation fail <span className="text-xs text-muted">(shows the error and retry path)</span></span>
          </label>
        </>
      )}
      <button className={`${btn} mt-2`} onClick={async () => { await api.resetDemo(); setFail(false); onReset(); }}>Reset to the seeded state</button>
    </Card>
  );
}
