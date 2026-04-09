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
        const completed = runs.filter(
          (r: Record<string, unknown>) => r.status === "completed"
        ).length;
        const totalCost = runs.reduce(
          (sum: number, r: Record<string, unknown>) =>
            sum + ((r.total_cost_usd as number) || 0),
          0
        );
        setStats({
          totalRuns: runs.length,
          successRate: runs.length > 0 ? (completed / runs.length) * 100 : 0,
          totalCost,
          pendingApprovals: approvals.length,
        });
      } catch {
        // API not available yet
      }
    }
    loadStats();
  }, []);

  const cards = [
    { label: "Runs Today", value: stats.totalRuns },
    { label: "Success Rate", value: `${stats.successRate.toFixed(0)}%` },
    { label: "Total Cost", value: `$${stats.totalCost.toFixed(4)}` },
    { label: "Pending Approvals", value: stats.pendingApprovals },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-lg border border-gray-200 p-6"
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
