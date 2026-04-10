"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface Run { id: string; workflow_id: string; status: string; total_cost_usd: number; total_tokens: number; total_steps: number; created_at: string; }

const dot: Record<string, string> = { running: "#3b82f6", completed: "#0cce6b", failed: "#ee0000", paused: "#f5a623" };
const STATUS_COLORS = ["#0cce6b", "#ee0000", "#3b82f6", "#f5a623"];

export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [agents, setAgents] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    api.listRuns().then((r) => setRuns(r as Run[])).catch(() => {});
    api.listAgents().then((a) => setAgents(a as Array<Record<string, unknown>>)).catch(() => {});
  }, []);

  const completed = runs.filter((r) => r.status === "completed").length;
  const totalTokens = runs.reduce((s, r) => s + (r.total_tokens || 0), 0);

  // Tokens per run (last 10)
  const tokenData = runs.slice(0, 10).reverse().map((r, i) => ({
    name: `#${i + 1}`,
    tokens: r.total_tokens || 0,
  }));

  // Status distribution pie
  const statusCounts = [
    { name: "Completed", value: completed },
    { name: "Failed", value: runs.filter((r) => r.status === "failed").length },
    { name: "Running", value: runs.filter((r) => r.status === "running").length },
    { name: "Paused", value: runs.filter((r) => r.status === "paused").length },
  ].filter((s) => s.value > 0);

  // Tokens by provider (from agents)
  const providerTokens: Record<string, number> = {};
  agents.forEach((a) => {
    const provider = (a.provider as string) || "anthropic";
    providerTokens[provider] = (providerTokens[provider] || 0) + 1;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Tokens", value: totalTokens.toLocaleString() },
          { label: "Total Runs", value: runs.length },
          { label: "Success Rate", value: runs.length > 0 ? `${Math.round((completed / runs.length) * 100)}%` : "—" },
          { label: "Active Agents", value: agents.length },
        ].map((c) => (
          <div key={c.label} className="p-4 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{c.label}</div>
            <div className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Tokens per run */}
        <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>Tokens per Run (last 10)</div>
          {tokenData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tokenData}>
                <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#888" }} />
                <Bar dataKey="tokens" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>No data yet</div>
          )}
        </div>

        {/* Status distribution */}
        <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>Run Status</div>
          {statusCounts.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={statusCounts} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                    {statusCounts.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {statusCounts.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                    <span style={{ color: "var(--text-secondary)" }}>{s.name}: {s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[140px] flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>No data yet</div>
          )}
        </div>
      </div>

      {/* Agents by provider */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Agents by Provider</span>
          <Link href="/agents" className="text-[10px]" style={{ color: "var(--text-muted)" }}>View all →</Link>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(providerTokens).map(([provider, count]) => (
            <div key={provider} className="px-3 py-2 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="text-xs font-medium capitalize" style={{ color: "var(--text-primary)" }}>{provider}</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{count} agents</div>
            </div>
          ))}
        </div>
      </div>

      {/* Run History */}
      <div>
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Run History</span>
        <div className="rounded-lg overflow-hidden mt-2" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--bg-card)" }}>
                {["Status", "Workflow", "Tokens", "Steps", "Date"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 15).map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-3 py-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot[r.status] || "#666" }} />
                    <span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2"><Link href={`/runs/${r.id}`} className="text-xs hover:underline" style={{ color: "var(--text-primary)" }}>{r.workflow_id.slice(0, 8)}</Link></td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{(r.total_tokens || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{r.total_steps}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{r.created_at ? formatDate(r.created_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <div className="py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>No runs yet</div>}
        </div>
      </div>
    </div>
  );
}
