"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DashboardStats {
  totalRuns: number;
  successRate: number;
  totalCost: number;
  pendingApprovals: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRuns: 0,
    successRate: 0,
    totalCost: 0,
    pendingApprovals: 0,
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const [runs, approvals] = await Promise.all([
          api.listRuns() as Promise<Array<Record<string, unknown>>>,
          api.listApprovals() as Promise<Array<Record<string, unknown>>>,
        ]);
        const completed = runs.filter((r) => r.status === "completed").length;
        const totalCost = runs.reduce((sum, r) => sum + ((r.total_cost_usd as number) || 0), 0);
        setStats({
          totalRuns: runs.length,
          successRate: runs.length > 0 ? (completed / runs.length) * 100 : 0,
          totalCost,
          pendingApprovals: approvals.length,
        });
      } catch {
        // API not available
      }
    }
    loadStats();
  }, []);

  const cards = [
    { label: "Total Runs", value: stats.totalRuns, color: "var(--info)" },
    { label: "Success Rate", value: `${stats.successRate.toFixed(0)}%`, color: "var(--success)" },
    { label: "Total Cost", value: `$${stats.totalCost.toFixed(4)}`, color: "var(--warning)" },
    { label: "Pending Approvals", value: stats.pendingApprovals, color: "var(--accent)" },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Dashboard</h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>Overview of your AI workforce</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl p-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {card.label}
            </p>
            <p className="text-3xl font-bold mt-2" style={{ color: card.color }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Quick Start</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a href="/chat" className="rounded-lg p-4 transition-all" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>Create Workflow</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Describe a process and generate a workflow</p>
          </a>
          <a href="/agents" className="rounded-lg p-4 transition-all" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>Manage Agents</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Create, edit, and configure AI agents</p>
          </a>
          <a href="/runs" className="rounded-lg p-4 transition-all" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>View Runs</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Monitor workflow executions</p>
          </a>
        </div>
      </div>
    </div>
  );
}
