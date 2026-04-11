"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import BuilderChat from "@/components/BuilderChat";
import ToolPicker from "@/components/ToolPicker";

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showToolPicker, setShowToolPicker] = useState(false);
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
    tools: [] as Array<{ name: string; description: string; url: string; method: string; headers: string; parameters: string }>,
    knowledge_bases: [] as Array<{ name: string; type: string; content: string }>,
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
        // Default-select the first model if form.model is empty
        if (all.length > 0 && !form.model) {
          update("model", all[0].id);
          update("provider", all[0].provider);
        }
      }
    }
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const parsedTools = form.tools.map((t) => ({
        name: t.name, description: t.description, url: t.url, method: t.method,
        headers: t.headers ? JSON.parse(t.headers) : {},
        parameters: t.parameters ? JSON.parse(t.parameters) : {},
      }));
      await api.createAgent({
        ...form,
        tools: parsedTools,
        model: form.model || null,
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
    <div className="flex-1 min-w-0 max-w-2xl">
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
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Model</label>
          <select
            value={form.model}
            onChange={(e) => {
              const id = e.target.value;
              update("model", id);
              const picked = availableModels.find((m) => m.id === id);
              if (picked) update("provider", picked.provider);
            }}
            className="w-full px-3 py-2 rounded-md text-sm"
            style={s}
          >
            {availableModels.length === 0 ? (
              <option value="">No providers connected — go to Settings</option>
            ) : (
              Object.entries(
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
              ))
            )}
          </select>
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Подключи больше провайдеров в Settings, чтобы появились модели в списке.
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

        {/* Tools */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Tools (API Integrations)</label>
            <div className="flex gap-2">
              <button onClick={() => setShowToolPicker(true)} className="text-xs px-2 py-0.5 rounded" style={{ color: "#0cce6b", border: "1px solid var(--border)" }}>From Library</button>
              <button onClick={() => update("tools", [...form.tools, { name: "", description: "", url: "", method: "POST", headers: "", parameters: "" }])} className="text-xs" style={{ color: "var(--accent-light, #3291ff)" }}>+ Manual</button>
            </div>
          </div>
          {showToolPicker && (
            <ToolPicker
              selectedNames={form.tools.map((t) => t.name)}
              onSelect={(picked) => {
                const newTools = picked.map((t) => ({
                  name: t.name, description: t.description, url: t.url,
                  method: t.method, headers: "", parameters: "",
                }));
                update("tools", [...form.tools, ...newTools]);
              }}
              onClose={() => setShowToolPicker(false)}
            />
          )}
          {form.tools.map((tool, i) => (
            <div key={i} className="rounded-lg p-3 mb-2" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <div className="flex justify-between mb-2">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Tool #{i + 1}</span>
                <button onClick={() => update("tools", form.tools.filter((_, j) => j !== i))} className="text-[10px]" style={{ color: "#ee0000" }}>Remove</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input value={tool.name} onChange={(e) => { const t = [...form.tools]; t[i] = { ...t[i], name: e.target.value }; update("tools", t); }} placeholder="send_telegram" className="px-2 py-1.5 rounded text-xs" style={s} />
                <div className="flex gap-1">
                  <select value={tool.method} onChange={(e) => { const t = [...form.tools]; t[i] = { ...t[i], method: e.target.value }; update("tools", t); }} className="px-2 py-1.5 rounded text-xs w-20" style={s}>
                    <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
                  </select>
                  <input value={tool.url} onChange={(e) => { const t = [...form.tools]; t[i] = { ...t[i], url: e.target.value }; update("tools", t); }} placeholder="https://api.example.com/..." className="flex-1 px-2 py-1.5 rounded text-xs" style={s} />
                </div>
              </div>
              <input value={tool.description} onChange={(e) => { const t = [...form.tools]; t[i] = { ...t[i], description: e.target.value }; update("tools", t); }} placeholder="Description for AI" className="w-full px-2 py-1.5 rounded text-xs mb-1" style={s} />
            </div>
          ))}
        </div>

        {/* Knowledge Bases */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Knowledge Base</label>
            <button onClick={() => update("knowledge_bases", [...form.knowledge_bases, { name: "", type: "text", content: "" }])} className="text-xs" style={{ color: "var(--accent-light, #3291ff)" }}>+ Add</button>
          </div>
          {form.knowledge_bases.map((kb, i) => (
            <div key={i} className="rounded-lg p-3 mb-2" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <div className="flex justify-between mb-2">
                <div className="flex gap-2">
                  {["text", "url", "file"].map((t) => (
                    <button key={t} onClick={() => { const k = [...form.knowledge_bases]; k[i] = { ...k[i], type: t, content: "" }; update("knowledge_bases", k); }}
                      className="text-[10px] px-2 py-0.5 rounded capitalize"
                      style={{ background: kb.type === t ? "var(--bg-hover)" : "transparent", color: kb.type === t ? "var(--text-primary)" : "var(--text-muted)", border: `1px solid ${kb.type === t ? "var(--text-primary)" : "var(--border)"}` }}>
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={() => update("knowledge_bases", form.knowledge_bases.filter((_, j) => j !== i))} className="text-[10px]" style={{ color: "#ee0000" }}>Remove</button>
              </div>
              <input value={kb.name} onChange={(e) => { const k = [...form.knowledge_bases]; k[i] = { ...k[i], name: e.target.value }; update("knowledge_bases", k); }} placeholder="Name" className="w-full px-2 py-1.5 rounded text-xs mb-2" style={s} />
              {kb.type === "text" && (
                <textarea value={kb.content} onChange={(e) => { const k = [...form.knowledge_bases]; k[i] = { ...k[i], content: e.target.value }; update("knowledge_bases", k); }} placeholder="Paste your knowledge text here..." rows={4} className="w-full px-2 py-1.5 rounded text-xs" style={s} />
              )}
              {kb.type === "url" && (
                <input value={kb.content} onChange={(e) => { const k = [...form.knowledge_bases]; k[i] = { ...k[i], content: e.target.value }; update("knowledge_bases", k); }} placeholder="https://docs.example.com/api" className="w-full px-2 py-1.5 rounded text-xs" style={s} />
              )}
              {kb.type === "file" && (
                <div className="rounded-md p-4 text-center" style={{ border: "1px dashed var(--border)" }}>
                  {kb.content ? (
                    <p className="text-xs" style={{ color: "var(--text-primary)" }}>{kb.content}</p>
                  ) : (
                    <>
                    <input type="file" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const result = (await api.uploadFile(file)) as { filename: string; url: string | null; text_content?: string };
                        const k = [...form.knowledge_bases];
                        k[i] = { ...k[i], content: result.url || result.text_content || result.filename };
                        update("knowledge_bases", k);
                      } catch { alert("Upload failed"); }
                    }} className="text-xs" style={{ color: "var(--text-muted)" }} />
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Max 10MB</p>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
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
          <button onClick={handleSave} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
            {saving ? "Creating..." : "Create Agent"}
          </button>
          <button onClick={() => router.push("/agents")} className="px-4 py-2 rounded-md text-sm" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
        </div>
      </div>
    </div>
    {/* Chat Helper — pinned to viewport right edge */}
    <aside
      className="w-80 shrink-0 sticky top-12 hidden lg:block -my-6 self-start h-[calc(100vh-48px)]"
      style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-primary)" }}
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
