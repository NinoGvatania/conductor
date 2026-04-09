"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCost, formatDate } from "@/lib/utils";

interface Run { id: string; workflow_id: string; status: string; total_cost_usd: number; total_tokens: number; total_steps: number; created_at: string; }

const dot: Record<string, string> = { running: "var(--accent)", completed: "#0cce6b", failed: "#ee0000", paused: "#f5a623" };

export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [agents, setAgents] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    api.listRuns().then((r) => setRuns(r as Run[])).catch(() => {});
    api.listAgents().then((a) => setAgents(a as Array<Record<string, unknown>>)).catch(() => {});
  }, []);

  const completed = runs.filter((r) => r.status === "completed").length;
  const totalCost = runs.reduce((s, r) => s + (r.total_cost_usd || 0), 0);
  const totalTokens = runs.reduce((s, r) => s + (r.total_tokens || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total Runs", value: runs.length },
          { label: "Completed", value: `${completed}/${runs.length}` },
          { label: "Total Cost", value: `$${totalCost.toFixed(4)}` },
          { label: "Tokens Used", value: totalTokens.toLocaleString() },
        ].map((c) => (
          <div key={c.label} className="p-4 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{c.label}</div>
            <div className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Active agents */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Agents ({agents.length})</h2>
          <Link href="/agents" className="text-xs" style={{ color: "var(--text-muted)" }}>View all →</Link>
        </div>
        <div className="flex gap-2 flex-wrap">
          {agents.slice(0, 8).map((a, i) => (
            <div key={i} className="px-3 py-1.5 rounded-md text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              {a.name as string}
              <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{a.model_tier as string}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Runs history */}
      <div>
        <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>Run History</h2>
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--bg-card)" }}>
                {["Status", "Workflow", "Cost", "Tokens", "Steps", "Date"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 20).map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-3 py-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot[r.status] || "var(--text-muted)" }} />
                    <span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2"><Link href={`/runs/${r.id}`} className="text-xs hover:underline" style={{ color: "var(--text-primary)" }}>{r.workflow_id.slice(0, 8)}</Link></td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{formatCost(r.total_cost_usd)}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{r.total_tokens}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{r.total_steps}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{r.created_at ? formatDate(r.created_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <div className="py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>No runs yet. Go to Chat to start.</div>}
        </div>
      </div>
    </div>
  );
}
