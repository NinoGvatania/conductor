"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState({ totalRuns: 0, successRate: 0, totalCost: 0, pendingApprovals: 0 });

  useEffect(() => {
    async function load() {
      try {
        const [runs, approvals] = await Promise.all([
          api.listRuns() as Promise<Array<Record<string, unknown>>>,
          api.listApprovals() as Promise<Array<Record<string, unknown>>>,
        ]);
        const completed = runs.filter((r) => r.status === "completed").length;
        setStats({
          totalRuns: runs.length,
          successRate: runs.length > 0 ? Math.round((completed / runs.length) * 100) : 0,
          totalCost: runs.reduce((s, r) => s + ((r.total_cost_usd as number) || 0), 0),
          pendingApprovals: approvals.length,
        });
      } catch {}
    }
    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Overview</h1>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Runs", value: stats.totalRuns },
          { label: "Success Rate", value: `${stats.successRate}%` },
          { label: "Total Cost", value: `$${stats.totalCost.toFixed(2)}` },
          { label: "Pending", value: stats.pendingApprovals },
        ].map((c) => (
          <div key={c.label} className="p-4 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{c.label}</div>
            <div className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>{c.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="px-4 py-3" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Quick Actions</span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {[
            { href: "/chat", label: "Create Workflow", desc: "Describe a process in natural language" },
            { href: "/agents/new", label: "Create Agent", desc: "Build a custom AI agent" },
            { href: "/runs", label: "View Runs", desc: "Monitor workflow executions" },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="flex items-center justify-between px-4 py-3 transition-colors" style={{ background: "var(--bg-secondary)" }}>
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{a.label}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{a.desc}</div>
              </div>
              <span style={{ color: "var(--text-muted)" }}>→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
