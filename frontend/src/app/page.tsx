"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface Run { id: string; workflow_id: string; status: string; total_cost_usd: number; total_tokens: number; total_steps: number; created_at: string; }
interface TokenStats { by_provider: Record<string, { input_tokens: number; output_tokens: number; total: number }>; by_model: Record<string, { input_tokens: number; output_tokens: number; total: number }>; total_tokens: number; }

const dot: Record<string, string> = { running: "#3b82f6", completed: "#0cce6b", failed: "#ee0000", paused: "#f5a623" };
const STATUS_COLORS = ["#0cce6b", "#ee0000", "#3b82f6", "#f5a623"];
const PROVIDER_COLORS: Record<string, string> = { anthropic: "#d97706", openai: "#10b981", gemini: "#3b82f6", yandexgpt: "#ef4444", gigachat: "#8b5cf6", mistral: "#f59e0b", custom: "#6b7280" };

export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [agents, setAgents] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    api.listRuns().then((r) => setRuns(r as Run[])).catch((e) => console.error(e));
    api.getTokenStats().then((s) => setStats(s as TokenStats)).catch((e) => console.error(e));
    api.listAgents().then((a) => setAgents(a as Array<Record<string, unknown>>)).catch((e) => console.error(e));
  }, []);

  const completed = runs.filter((r) => r.status === "completed").length;
  const totalTokens = stats?.total_tokens || runs.reduce((s, r) => s + (r.total_tokens || 0), 0);

  // Provider chart data
  const providerData = stats ? Object.entries(stats.by_provider).map(([name, data]) => ({
    name, input: data.input_tokens, output: data.output_tokens, total: data.total,
  })) : [];

  // Model chart data
  const modelData = stats ? Object.entries(stats.by_model)
    .filter(([name]) => name !== "unknown")
    .map(([name, data]) => ({ name: name.replace("claude-", "").replace("-20251001", ""), tokens: data.total }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 6) : [];

  // Status pie
  const statusCounts = [
    { name: "Completed", value: completed },
    { name: "Failed", value: runs.filter((r) => r.status === "failed").length },
    { name: "Running", value: runs.filter((r) => r.status === "running").length },
    { name: "Paused", value: runs.filter((r) => r.status === "paused").length },
  ].filter((s) => s.value > 0);

  // Tokens per run (last 10)
  const tokenPerRun = runs.slice(0, 10).reverse().map((r, i) => ({ name: `#${i + 1}`, tokens: r.total_tokens || 0 }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Dashboard</h1>

      {/* Stats row */}
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

      {/* Charts row 1: by provider + by model */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>Tokens by Provider</div>
          {providerData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={providerData}>
                <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="input" stackId="a" fill="#3b82f6" name="Input" radius={[0, 0, 0, 0]} />
                <Bar dataKey="output" stackId="a" fill="#6366f1" name="Output" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>No data yet</div>
          )}
        </div>

        <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>Tokens by Model</div>
          {modelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={modelData} layout="vertical">
                <XAxis type="number" tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="tokens" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>No data yet</div>
          )}
        </div>
      </div>

      {/* Charts row 2: tokens per run + status */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>Tokens per Run (last 10)</div>
          {tokenPerRun.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={tokenPerRun}>
                <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="tokens" fill="#0cce6b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[150px] flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>No data yet</div>
          )}
        </div>

        <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>Run Status</div>
          {statusCounts.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={statusCounts} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={3}>
                    {statusCounts.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {statusCounts.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                    <span style={{ color: "var(--text-secondary)" }}>{s.name}: {s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[120px] flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>No data yet</div>
          )}
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
