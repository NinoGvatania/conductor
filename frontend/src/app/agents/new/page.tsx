"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import BuilderChat from "@/components/BuilderChat";
import ToolPicker from "@/components/ToolPicker";
import KnowledgePicker from "@/components/KnowledgePicker";

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showKbPicker, setShowKbPicker] = useState(false);
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; name: string; provider: string }>
  >([]);
  const [form, setForm] = useState({
    name: "", description: "", purpose: "",
    provider: "anthropic", model_tier: "balanced",
    model: "" as string, // explicit model id; empty = tier fallback
    system_prompt: "",
    constraints: "",
    clarification_rules: "",
    temperature: 0,
    max_tokens: "" as number | "", // empty = auto, use model max
    tools: [] as Array<{
      name: string;
      description: string;
      connection_id?: string | null;
      connection_name?: string | null;
    }>,
    knowledge_bases: [] as Array<{
      id?: string;
      name: string;
      description?: string;
      file_count?: number;
      // legacy fields kept for backwards compat
      type?: string;
      content?: string;
    }>,
    is_public: false, tags: "",
  });

  function update(f: string, v: unknown) { setForm((p) => ({ ...p, [f]: v })); }

  // Fetch models from every connected provider
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
          // not connected — skip
        }
      }
      if (!cancelled) {
        setAvailableModels(all);
        // NO auto-default — user must pick the model explicitly. If they ask
        // the AI helper to create the agent, the AI will set model itself.
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    if (!form.name.trim()) return;
    if (!form.model) {
      alert("Выбери модель — поле Model обязательное.");
      return;
    }
    setSaving(true);
    try {
      await api.createAgent({
        ...form,
        tools: form.tools,
        model: form.model,
        max_tokens: form.max_tokens === "" ? null : form.max_tokens,
        output_schema: {},
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push("/agents");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="flex gap-6 -mr-6">
    <div className="flex-1 min-w-0">
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Create Agent</h1>

      <div className="space-y-5">
        {/* Basic */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Sales Manager" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Description</label>
            <input value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="What this agent does" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
        </div>

        {/* Model picker — every connected provider's models grouped */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Model <span style={{ color: "#ee4444" }}>*</span>
          </label>
          <select
            value={form.model}
            onChange={(e) => {
              const id = e.target.value;
              update("model", id);
              const picked = availableModels.find((m) => m.id === id);
              if (picked) update("provider", picked.provider);
            }}
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{
              ...s,
              borderColor: form.model ? (s as { border?: string }).border?.split(" ")[2] : "#ee4444",
            }}
          >
            {availableModels.length === 0 ? (
              <option value="">No providers connected — go to Settings</option>
            ) : (
              <>
                <option value="">— Выбери модель —</option>
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
            Обязательное поле. Если моделей нет — подключи провайдера в Settings.
          </p>
        </div>

        {/* System Prompt */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>System Prompt</label>
          <textarea value={form.system_prompt} onChange={(e) => update("system_prompt", e.target.value)} rows={5} placeholder="You are a sales manager agent. Your role is to..." className="w-full px-3 py-2 rounded-md text-sm" style={s} />
        </div>

        {/* Constraints */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Constraints — hard rules (enforced)</label>
          <textarea value={form.constraints} onChange={(e) => update("constraints", e.target.value)} rows={5} placeholder={"One rule per line. Examples:\n- Never promise discounts above 20%\n- Response must be under 500 words\n- Never mention competitors by name\n- Always respond in the user's language\n- Never share internal financial data"} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Every agent response is automatically checked against these rules by a fast LLM judge. Violations force a retry with the agent's max_retries budget.
          </p>
        </div>

        {/* Clarification Rules */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Clarification Rules — when to ask instead of guessing</label>
          <textarea value={form.clarification_rules} onChange={(e) => update("clarification_rules", e.target.value)} rows={3} placeholder="Ask when customer budget is unclear. Ask when request conflicts with policy. Ask before making any write action." className="w-full px-3 py-2 rounded-md text-sm" style={s} />
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
              onConfirm={(picked) => update("tools", picked)}
              onClose={() => setShowToolPicker(false)}
            />
          )}
          {form.tools.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(() => {
                const groups = new Map<
                  string,
                  { label: string; connectionId: string | null; tools: typeof form.tools }
                >();
                for (const t of form.tools) {
                  const connId = t.connection_id || null;
                  const key = connId || `orphan:${t.name}`;
                  const label = t.connection_name || t.name;
                  const existing = groups.get(key);
                  if (existing) existing.tools.push(t);
                  else groups.set(key, { label, connectionId: connId, tools: [t] });
                }
                return Array.from(groups.values()).map((group) => {
                  const count = group.tools.length;
                  const isIntegration = !!group.connectionId;
                  return (
                    <div
                      key={group.label}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                    >
                      <span style={{ color: "var(--text-primary)" }}>{group.label}</span>
                      {isIntegration && count > 1 && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {count} actions
                        </span>
                      )}
                      <button
                        onClick={() => {
                          const namesToRemove = new Set(group.tools.map((t) => t.name));
                          update("tools", form.tools.filter((t) => !namesToRemove.has(t.name)));
                        }}
                        className="text-[11px] leading-none"
                        style={{ color: "var(--text-muted)" }}
                        title="Remove integration"
                      >
                        ×
                      </button>
                    </div>
                  );
                });
              })()}
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
            <label className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Knowledge Bases</label>
            <button
              onClick={() => setShowKbPicker(true)}
              className="text-xs px-2 py-1 rounded"
              style={{ color: "#0cce6b", border: "1px solid var(--border)" }}
            >
              + Add from library
            </button>
          </div>
          {showKbPicker && (
            <KnowledgePicker
              selectedIds={form.knowledge_bases.map((kb) => kb.id || "").filter(Boolean)}
              onConfirm={(picked) => update("knowledge_bases", picked)}
              onClose={() => setShowKbPicker(false)}
            />
          )}
          {form.knowledge_bases.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {form.knowledge_bases.map((kb, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <span>📚</span>
                  <span style={{ color: "var(--text-primary)" }}>{kb.name}</span>
                  <button
                    onClick={() => update("knowledge_bases", form.knowledge_bases.filter((_, j) => j !== i))}
                    className="text-[11px] leading-none"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Нет подключённых баз знаний. Создавай и загружай файлы во{" "}
              <a href="/knowledge" target="_blank" style={{ color: "var(--accent-light, #3291ff)", textDecoration: "underline" }}>
                вкладке Knowledge
              </a>.
            </p>
          )}
        </div>

        {/* Advanced */}
        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs" style={{ color: "var(--text-muted)" }}>
          {showAdvanced ? "Hide" : "Show"} advanced settings
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Temperature</label>
              <input type="number" value={form.temperature} onChange={(e) => update("temperature", parseFloat(e.target.value))} min={0} max={2} step={0.1} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Max Tokens (optional)</label>
              <input
                type="number"
                value={form.max_tokens}
                onChange={(e) => {
                  const v = e.target.value;
                  update("max_tokens", v === "" ? "" : parseInt(v) || 0);
                }}
                placeholder="Auto — use model maximum"
                className="w-full px-3 py-2 rounded-md text-sm"
                style={s}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                Пусто — лимит модели. Укажи число для ограничения.
              </p>
            </div>
          </div>
        )}

        {/* Sharing */}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.is_public} onChange={(e) => update("is_public", e.target.checked)} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Publish to agent library</span>
        </label>

        {/* Save */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.model}
            className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
            title={!form.model ? "Выбери модель" : undefined}
          >
            {saving ? "Creating..." : "Create Agent"}
          </button>
          <button onClick={() => router.push("/agents")} className="px-4 py-2 rounded-md text-sm" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
        </div>
      </div>
    </div>
    </div>
    {/* Chat Helper — pinned to viewport right edge */}
    <aside
      className="w-80 shrink-0 sticky top-12 hidden lg:block -my-6 self-start h-[calc(100vh-48px)]"
      style={{ borderLeft: "1px solid var(--border)" }}
    >
      <BuilderChat
        contextType="agent_builder"
        title="AI Assistant"
        placeholder="Describe your agent..."
        onEntityCreated={(e) => {
          if (e.type === "agent") {
            router.push(`/agents/${e.id}/edit`);
          }
        }}
      />
    </aside>
    </div>
  );
}
