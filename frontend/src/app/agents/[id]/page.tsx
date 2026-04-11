"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

interface AgentDetail {
  id: string;
  name: string;
  description: string;
  purpose: string;
  model_tier: string;
  provider: string;
  system_prompt: string;
  output_schema: Record<string, unknown>;
  temperature: number;
  timeout_seconds: number;
  max_retries: number;
  max_tokens: number;
  tools: Array<Record<string, unknown>>;
  knowledge_bases: Array<Record<string, unknown>>;
  is_builtin: boolean;
  is_public: boolean;
  tags: string[];
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getAgent(agentId).then((d) => setAgent(d as AgentDetail)).catch((e) => setError(e.message));
  }, [agentId]);

  async function handleClone() {
    try {
      const result = (await api.cloneAgent(agentId)) as { id: string };
      router.push(`/agents/${result.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clone failed");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this agent?")) return;
    try {
      await api.deleteAgent(agentId);
      router.push("/agents");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (error) return <div className="text-sm" style={{ color: "var(--error)" }}>{error}</div>;
  if (!agent) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>;

  const rows: Array<[string, string]> = [
    ["Provider", agent.provider || "anthropic"],
    ["Model Tier", agent.model_tier],
    ["Temperature", String(agent.temperature ?? 0)],
    ["Max Tokens", String(agent.max_tokens ?? 32000)],
    ["Timeout", `${agent.timeout_seconds ?? 120}s`],
    ["Max Retries", String(agent.max_retries ?? 3)],
    ["Type", agent.is_builtin ? "Built-in" : "Custom"],
    ["Public", agent.is_public ? "Yes" : "No"],
  ];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/agents" className="text-xs mb-2 inline-block" style={{ color: "var(--text-muted)" }}>← Back to Agents</Link>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>{agent.name}</h1>
          {agent.description && <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{agent.description}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={handleClone} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Clone</button>
          {!agent.is_builtin && (
            <>
              <Link href={`/agents/${agentId}/edit`} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>Edit</Link>
              <button onClick={handleDelete} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ color: "var(--error)", border: "1px solid var(--border)" }}>Delete</button>
            </>
          )}
        </div>
      </div>

      {/* Config table */}
      <div className="rounded-lg overflow-hidden mb-6" style={{ border: "1px solid var(--border)" }}>
        <div className="px-4 py-2.5" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Configuration</span>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="flex px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-sm w-36 shrink-0" style={{ color: "var(--text-muted)" }}>{label}</span>
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>{value}</span>
          </div>
        ))}
      </div>

      {/* System Prompt */}
      {agent.system_prompt && (
        <div className="rounded-lg overflow-hidden mb-6" style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-2.5" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>System Prompt</span>
          </div>
          <pre className="px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-secondary)" }}>{agent.system_prompt}</pre>
        </div>
      )}

      {/* Output Schema */}
      {agent.output_schema && Object.keys(agent.output_schema).length > 0 && (
        <div className="rounded-lg overflow-hidden mb-6" style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-2.5" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Output Schema</span>
          </div>
          <pre className="px-4 py-3 text-xs overflow-auto" style={{ color: "var(--text-secondary)" }}>{JSON.stringify(agent.output_schema, null, 2)}</pre>
        </div>
      )}

      {/* Tools */}
      {agent.tools && agent.tools.length > 0 && (
        <div className="rounded-lg overflow-hidden mb-6" style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-2.5" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Tools ({agent.tools.length})</span>
          </div>
          {agent.tools.map((t, i) => (
            <div key={i} className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{(t.name as string) || `Tool ${i + 1}`}</span>
              {t.description ? <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{String(t.description)}</span> : null}
            </div>
          ))}
        </div>
      )}

      {/* Knowledge Bases */}
      {agent.knowledge_bases && agent.knowledge_bases.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-2.5" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Knowledge Bases ({agent.knowledge_bases.length})</span>
          </div>
          {agent.knowledge_bases.map((kb, i) => (
            <div key={i} className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{(kb.name as string) || `KB ${i + 1}`}</span>
              {kb.type ? <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{String(kb.type)}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
