"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
  description: string;
  model_tier: string;
  provider: string;
  is_builtin: boolean;
  is_public: boolean;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<"all" | "builtin" | "custom">("all");

  useEffect(() => {
    api.listAgents().then((d) => setAgents(d as Agent[])).catch(() => {});
  }, []);

  const filtered = agents.filter((a) =>
    filter === "all" ? true : filter === "builtin" ? a.is_builtin : !a.is_builtin
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Agents</h1>
        <Link href="/agents/new" className="px-3 py-1.5 rounded-md text-sm font-medium text-white" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
          Create Agent
        </Link>
      </div>

      <div className="flex gap-1 mb-4 p-0.5 rounded-md w-fit" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {(["all", "builtin", "custom"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 rounded text-xs font-medium capitalize transition-colors" style={{ background: filter === f ? "var(--bg-hover)" : "transparent", color: filter === f ? "var(--text-primary)" : "var(--text-muted)" }}>
            {f}
          </button>
        ))}
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Description</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Tier</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Provider</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((agent) => (
              <tr key={agent.id} className="transition-colors" style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3">
                  <Link href={agent.is_builtin ? `/agents/${agent.id}` : `/agents/${agent.id}/edit`} className="text-sm font-medium hover:underline" style={{ color: "var(--text-primary)" }}>
                    {agent.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm max-w-xs truncate" style={{ color: "var(--text-secondary)" }}>{agent.description}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--bg-hover)", color: agent.model_tier === "powerful" ? "var(--accent-light)" : agent.model_tier === "fast" ? "var(--success)" : "var(--text-secondary)" }}>
                    {agent.model_tier}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{agent.provider || "anthropic"}</td>
                <td className="px-4 py-3">
                  <span className="text-xs" style={{ color: agent.is_builtin ? "var(--text-muted)" : "var(--accent-light)" }}>
                    {agent.is_builtin ? "Built-in" : "Custom"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No agents found</div>
        )}
      </div>
    </div>
  );
}
