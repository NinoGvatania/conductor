"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import ToolPicker from "@/components/ToolPicker";
import BuilderChat from "@/components/BuilderChat";

export default function EditAgentPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; name: string; provider: string }>
  >([]);
  const [form, setForm] = useState({
    name: "", description: "", purpose: "",
    provider: "anthropic",
    model_tier: "balanced",
    model: "" as string, // explicit model id; empty = use tier fallback
    system_prompt: "",
    constraints: "",
    clarification_rules: "",
    temperature: 0, timeout_seconds: 120, max_retries: 3,
    max_tokens: "" as number | "",  // empty string = "auto / use model max"
    tools: [] as Array<{ name: string; description: string }>,
    knowledge_bases: [] as Array<{ name: string; type: string; source: string }>,
    is_public: false, tags: "",
  });

  // Load models from every connected provider once on mount
  useEffect(() => {
    let cancelled = false;
    const PROVIDERS = ["anthropic", "openai", "gemini", "mistral", "yandexgpt", "gigachat"];
    async function run() {
      const all: Array<{ id: string; name: string; provider: string }> = [];
      for (const p of PROVIDERS) {
        try {
          const list = (await api.getProviderModels(p)) as Array<{
            id: string; name: string; provider?: string;
          }>;
          if (Array.isArray(list)) {
            all.push(...list.map((m) => ({ ...m, provider: m.provider || p })));
          }
        } catch {
          // provider not connected — skip silently
        }
      }
      if (!cancelled) setAvailableModels(all);
    }
    run();
    return () => { cancelled = true; };
  }, []);

  const loadAgent = useCallback(async () => {
    try {
      const d = (await api.getAgent(agentId)) as Record<string, unknown>;
      const rawMaxTokens = d.max_tokens as number | null | undefined;
      setForm({
        name: (d.name as string) || "",
        description: (d.description as string) || "",
        purpose: (d.purpose as string) || "",
        provider: (d.provider as string) || "anthropic",
        model_tier: (d.model_tier as string) || "balanced",
        model: (d.model as string) || "",
        system_prompt: (d.system_prompt as string) || "",
        constraints: (d.constraints as string) || "",
        clarification_rules: (d.clarification_rules as string) || "",
        temperature: (d.temperature as number) || 0,
        timeout_seconds: (d.timeout_seconds as number) || 120,
        max_retries: (d.max_retries as number) || 3,
        max_tokens: rawMaxTokens == null ? "" : rawMaxTokens,
        tools: (d.tools as Array<{ name: string; description: string }>) || [],
        knowledge_bases: (d.knowledge_bases as Array<{ name: string; type: string; source: string }>) || [],
        is_public: (d.is_public as boolean) || false,
        tags: Array.isArray(d.tags) ? (d.tags as string[]).join(", ") : "",
      });
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadAgent().catch(() => setLoading(false));
  }, [loadAgent]);

  function update(field: string, value: unknown) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateAgent(agentId, {
        ...form,
        // "" → null (auto, use model max); a number stays a number
        max_tokens: form.max_tokens === "" ? null : form.max_tokens,
        // "" model → null (fall back to tier)
        model: form.model || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push(`/agents/${agentId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>;

  const inputStyle = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="flex gap-6 -mr-6">
      <div className="flex-1 min-w-0">
      <div className="max-w-2xl">
      <Link href={`/agents/${agentId}`} className="text-xs mb-2 inline-block" style={{ color: "var(--text-muted)" }}>← Back</Link>
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Edit Agent</h1>

      <div className="space-y-5">
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Description</label>
          <input value={form.description} onChange={(e) => update("description", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Model</label>
            <select
              value={form.model}
              onChange={(e) => {
                const modelId = e.target.value;
                update("model", modelId);
                // Auto-derive provider from the picked model so the backend
                // knows which provider class to instantiate at run time
                const picked = availableModels.find((m) => m.id === modelId);
                if (picked) update("provider", picked.provider);
              }}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={inputStyle}
            >
              {availableModels.length === 0 ? (
                <option value="">No providers connected — go to Settings</option>
              ) : (
                <>
                  <option value="">— Use tier default ({form.model_tier}) —</option>
                  {Object.entries(
                    availableModels.reduce<Record<string, typeof availableModels>>((acc, m) => {
                      (acc[m.provider] = acc[m.provider] || []).push(m);
                      return acc;
                    }, {}),
                  ).map(([provider, list]) => (
                    <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                      {list.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </>
              )}
            </select>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Выбери конкретную модель из подключённых провайдеров. Пусто — fallback на tier ({form.model_tier}).
            </p>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Temperature</label>
            <input type="number" value={form.temperature} onChange={(e) => update("temperature", parseFloat(e.target.value))} min={0} max={2} step={0.1} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              0 — детерминированно, 1 — креативно.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Max tokens (optional)</label>
          <input
            type="number"
            value={form.max_tokens}
            onChange={(e) => {
              const v = e.target.value;
              update("max_tokens", v === "" ? "" : parseInt(v) || 0);
            }}
            placeholder="Auto — use model maximum"
            className="w-full px-3 py-2 rounded-md text-sm"
            style={inputStyle}
          />
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Оставь пустым чтобы использовать максимум модели. Укажи число если хочешь ограничить длину ответа (дешевле, но длинные ответы обрежутся).
          </p>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>System Prompt</label>
          <textarea value={form.system_prompt} onChange={(e) => update("system_prompt", e.target.value)} rows={5} className="w-full px-3 py-2 rounded-md text-sm font-mono" style={inputStyle} />
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Constraints — hard rules (enforced)</label>
          <textarea value={form.constraints} onChange={(e) => update("constraints", e.target.value)} rows={5} placeholder={"One rule per line. Examples:\n- Never promise discounts above 20%\n- Response must be under 500 words\n- Never mention competitors by name"} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Every agent response is automatically checked against these rules. Violations force a retry.
          </p>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Clarification Rules — when to ask instead of guessing</label>
          <textarea value={form.clarification_rules} onChange={(e) => update("clarification_rules", e.target.value)} rows={3} placeholder="Ask when budget is unclear..." className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
        </div>

        {/* Integrations */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Integrations</label>
            <button
              onClick={() => setShowToolPicker(true)}
              className="text-xs px-2 py-1 rounded"
              style={{ color: "#0cce6b", border: "1px solid var(--border)" }}
            >
              + Add from library
            </button>
          </div>
          {showToolPicker && (
            <ToolPicker
              selectedNames={form.tools.map((t) => t.name)}
              onConfirm={(picked) => {
                update(
                  "tools",
                  picked.map((t) => ({ name: t.name, description: t.description })),
                );
              }}
              onClose={() => setShowToolPicker(false)}
            />
          )}
          {form.tools.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {form.tools.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <span style={{ color: "var(--text-primary)" }}>{t.name}</span>
                  <button
                    onClick={() => update("tools", form.tools.filter((_, j) => j !== i))}
                    className="text-[11px] leading-none"
                    style={{ color: "var(--text-muted)" }}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Нет подключённых интеграций. Нажми{" "}
              <span style={{ color: "#0cce6b" }}>+ Add from library</span>, чтобы выбрать из своей
              библиотеки. Новые интеграции создаются во{" "}
              <a href="/tools" target="_blank" style={{ color: "var(--accent-light, #3291ff)", textDecoration: "underline" }}>
                вкладке Integrations
              </a>.
            </p>
          )}
        </div>

        {/* Knowledge Bases */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Knowledge Bases</label>
            <button onClick={() => update("knowledge_bases", [...form.knowledge_bases, { name: "", type: "text", source: "" }])} className="text-xs" style={{ color: "var(--accent)" }}>+ Add</button>
          </div>
          {form.knowledge_bases.map((kb, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={kb.name} onChange={(e) => { const arr = [...form.knowledge_bases]; arr[i] = { ...arr[i], name: e.target.value }; update("knowledge_bases", arr); }} placeholder="Name" className="flex-1 px-3 py-2 rounded-md text-sm" style={inputStyle} />
              <select value={kb.type} onChange={(e) => { const arr = [...form.knowledge_bases]; arr[i] = { ...arr[i], type: e.target.value }; update("knowledge_bases", arr); }} className="px-3 py-2 rounded-md text-sm" style={inputStyle}>
                <option value="text">Text</option>
                <option value="url">URL</option>
                <option value="file">File</option>
              </select>
              <input value={kb.source} onChange={(e) => { const arr = [...form.knowledge_bases]; arr[i] = { ...arr[i], source: e.target.value }; update("knowledge_bases", arr); }} placeholder="Source" className="flex-[2] px-3 py-2 rounded-md text-sm" style={inputStyle} />
              <button onClick={() => update("knowledge_bases", form.knowledge_bases.filter((_, j) => j !== i))} className="text-xs px-2" style={{ color: "var(--error)" }}>✕</button>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.is_public} onChange={(e) => update("is_public", e.target.checked)} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Public agent</span>
        </label>

        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => router.push(`/agents/${agentId}`)} className="px-4 py-2 rounded-md text-sm" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
        </div>
      </div>
      </div>
      </div>
      <aside
        className="w-80 shrink-0 sticky top-12 hidden lg:block -my-6 self-start h-[calc(100vh-48px)]"
        style={{ borderLeft: "1px solid var(--border)" }}
      >
        <BuilderChat
          contextType="agent_builder"
          contextId={agentId}
          title="Edit Agent with AI"
          placeholder="Ask to adjust the agent..."
          onEntityCreated={(e) => {
            if (e.type === "agent" && e.id === agentId) {
              loadAgent();
            }
          }}
        />
      </aside>
    </div>
  );
}
