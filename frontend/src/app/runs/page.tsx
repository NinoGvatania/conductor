"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCost, formatDate } from "@/lib/utils";

interface Run {
  id: string;
  workflow_id: string;
  status: string;
  total_cost_usd: number;
  total_tokens: number;
  total_steps: number;
  created_at: string;
}

const statusColors: Record<string, string> = {
  running: "var(--info)",
  completed: "var(--success)",
  failed: "var(--error)",
  paused: "var(--warning)",
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = (await api.listRuns(filter || undefined)) as Run[];
        setRuns(data);
      } catch {}
    }
    load();
  }, [filter]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Runs</h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Monitor workflow executions</p>

      <div className="flex gap-2 mb-6">
        {["", "running", "completed", "failed", "paused"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize"
            style={{
              background: filter === f ? "var(--accent)" : "var(--bg-card)",
              color: filter === f ? "white" : "var(--text-secondary)",
              border: `1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {f || "All"}
          </button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              {["Status", "Workflow", "Cost", "Steps", "Date"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-4 py-3">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: statusColors[run.status] || "var(--text-muted)" }} />
                  <span className="text-xs font-medium" style={{ color: statusColors[run.status] }}>{run.status}</span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/runs/${run.id}`} className="text-sm hover:underline" style={{ color: "var(--accent)" }}>{run.workflow_id}</Link>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>{formatCost(run.total_cost_usd)}</td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>{run.total_steps}</td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>{run.created_at ? formatDate(run.created_at) : "-"}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No runs found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
