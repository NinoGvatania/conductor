"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCost, formatDate } from "@/lib/utils";

interface Run { id: string; workflow_id: string; status: string; total_cost_usd: number; total_steps: number; created_at: string; }

const dot: Record<string, string> = { running: "var(--accent)", completed: "var(--success)", failed: "var(--error)", paused: "var(--warning)" };

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => { api.listRuns(filter || undefined).then((d) => setRuns(d as Run[])).catch(() => {}); }, [filter]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Runs</h1>
      <div className="flex gap-1 mb-4 p-0.5 rounded-md w-fit" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {["", "running", "completed", "failed", "paused"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 rounded text-xs font-medium capitalize" style={{ background: filter === f ? "var(--bg-hover)" : "transparent", color: filter === f ? "var(--text-primary)" : "var(--text-muted)" }}>
            {f || "All"}
          </button>
        ))}
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full">
          <thead><tr style={{ background: "var(--bg-card)" }}>
            {["Status", "Workflow", "Cost", "Steps", "Date"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot[r.status] || "var(--text-muted)" }} />
                  <span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{r.status}</span>
                </td>
                <td className="px-4 py-3"><Link href={`/runs/${r.id}`} className="text-sm hover:underline" style={{ color: "var(--text-primary)" }}>{r.workflow_id}</Link></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{formatCost(r.total_cost_usd)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.total_steps}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.created_at ? formatDate(r.created_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No runs yet</div>}
      </div>
    </div>
  );
}
