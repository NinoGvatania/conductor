"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
  description: string;
  purpose: string;
  model_tier: string;
  provider: string;
  is_builtin: boolean;
  is_public: boolean;
  tags: string[];
}

const tierColors: Record<string, string> = {
  fast: "var(--success)",
  balanced: "var(--info)",
  powerful: "var(--accent)",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<"all" | "builtin" | "custom">("all");

  useEffect(() => {
    async function load() {
      try {
        const data = (await api.listAgents()) as Agent[];
        setAgents(data);
      } catch {
        // API not available
      }
    }
    load();
  }, []);

  const filtered = agents.filter((a) => {
    if (filter === "builtin") return a.is_builtin;
    if (filter === "custom") return !a.is_builtin;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Agents</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Manage your AI agents, tools, and knowledge bases</p>
        </div>
        <Link
          href="/agents/new"
          className="px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all"
          style={{ background: "var(--accent)" }}
        >
          + New Agent
        </Link>
      </div>

      <div className="flex gap-2 mb-6">
        {(["all", "builtin", "custom"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
            style={{
              background: filter === f ? "var(--accent)" : "var(--bg-card)",
              color: filter === f ? "white" : "var(--text-secondary)",
              border: `1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {f} ({agents.filter((a) => f === "all" ? true : f === "builtin" ? a.is_builtin : !a.is_builtin).length})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((agent) => (
          <Link
            key={agent.id}
            href={agent.is_builtin ? `/agents/${agent.id}` : `/agents/${agent.id}/edit`}
            className="rounded-xl p-5 transition-all group"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{agent.name}</h3>
              <div className="flex gap-1.5">
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                  style={{ color: tierColors[agent.model_tier] || "var(--text-muted)", background: "var(--bg-secondary)" }}
                >
                  {agent.model_tier}
                </span>
              </div>
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              {agent.description}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>
                {agent.provider || "anthropic"}
              </span>
              {agent.is_builtin && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-secondary)", color: "var(--success)" }}>
                  builtin
                </span>
              )}
              {agent.is_public && !agent.is_builtin && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-secondary)", color: "var(--accent)" }}>
                  shared
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-muted)" }}>No agents found</p>
          <Link href="/agents/new" className="text-sm mt-2 inline-block" style={{ color: "var(--accent)" }}>
            Create your first agent
          </Link>
        </div>
      )}
    </div>
  );
}
