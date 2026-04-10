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

const tierColors: Record<string, string> = { fast: "#0cce6b", balanced: "#3b82f6", powerful: "#6366f1" };

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tab, setTab] = useState<"all" | "my" | "library">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.listAgents().then((d) => setAgents(d as Agent[])).catch((e) => console.error(e));
  }, []);

  const filtered = agents
    .filter((a) => {
      if (tab === "my") return !a.is_builtin;
      if (tab === "library") return a.is_builtin || a.is_public;
      return true;
    })
    .filter((a) =>
      !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Agents</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Build, discover, and manage AI agents</p>
        </div>
        <Link href="/agents/new" className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
          Create Agent
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-1 p-0.5 rounded-md" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {(["all", "my", "library"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-1 rounded text-xs font-medium capitalize" style={{ background: tab === t ? "var(--bg-hover)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-muted)" }}>
              {t === "my" ? "My Agents" : t === "library" ? "Library" : "All"}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents..."
          className="px-3 py-1.5 rounded-md text-sm flex-1 max-w-xs"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />
      </div>

      {/* Gallery view */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((agent) => (
          <Link
            key={agent.id}
            href={`/agents/${agent.id}`}
            className="rounded-lg p-5 transition-all group"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: tierColors[agent.model_tier] + "22", color: tierColors[agent.model_tier] }}>
                  {agent.name[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{agent.name}</div>
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{agent.provider}</div>
                </div>
              </div>
              {agent.is_builtin && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>built-in</span>
              )}
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              {agent.description}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: tierColors[agent.model_tier] + "18", color: tierColors[agent.model_tier] }}>
                {agent.model_tier}
              </span>
              {(agent.tags || []).slice(0, 2).map((tag, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {search ? "No agents match your search" : "No agents yet"}
          </p>
        </div>
      )}
    </div>
  );
}
