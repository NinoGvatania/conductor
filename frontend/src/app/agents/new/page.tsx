"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface CatalogProvider { id: string; name: string; models: Array<{ id: string; name: string; tier: string }>; }

const ALL_MODELS = [
  { provider: "anthropic", id: "claude-haiku-4-5-20251001", name: "Claude Haiku", tier: "fast" },
  { provider: "anthropic", id: "claude-sonnet-4-6", name: "Claude Sonnet", tier: "balanced" },
  { provider: "anthropic", id: "claude-opus-4-6", name: "Claude Opus", tier: "powerful" },
  { provider: "openai", id: "gpt-4o-mini", name: "GPT-4o Mini", tier: "fast" },
  { provider: "openai", id: "gpt-4o", name: "GPT-4o", tier: "balanced" },
  { provider: "openai", id: "o3", name: "o3", tier: "powerful" },
  { provider: "gemini", id: "gemini-2.0-flash", name: "Gemini Flash", tier: "fast" },
  { provider: "gemini", id: "gemini-2.5-pro", name: "Gemini Pro", tier: "balanced" },
];

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", purpose: "",
    provider: "anthropic", model_tier: "balanced",
    system_prompt: "",
    temperature: 0, max_tokens: 4096,
    tools: [] as Array<{ name: string; description: string; url: string; method: string; headers: string; parameters: string }>,
    knowledge_bases: [] as Array<{ name: string; type: string; content: string }>,
    is_public: false, tags: "",
  });

  function update(f: string, v: unknown) { setForm((p) => ({ ...p, [f]: v })); }

  const filteredModels = ALL_MODELS.filter((m) => m.provider === form.provider);

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
        ...form, tools: parsedTools,
        output_schema: {},
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push("/agents");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
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

        {/* Model */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Model</label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {["anthropic", "openai", "gemini"].map((p) => (
              <button key={p} onClick={() => update("provider", p)} className="px-3 py-1.5 rounded-md text-xs font-medium capitalize" style={{
                background: form.provider === p ? "var(--bg-hover)" : "var(--bg-card)",
                border: `1px solid ${form.provider === p ? "var(--text-primary)" : "var(--border)"}`,
                color: form.provider === p ? "var(--text-primary)" : "var(--text-muted)",
              }}>
                {p}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {filteredModels.map((m) => (
              <button key={m.id} onClick={() => update("model_tier", m.tier)} className="px-3 py-2 rounded-md text-left" style={{
                background: form.model_tier === m.tier ? "var(--bg-hover)" : "var(--bg-card)",
                border: `1px solid ${form.model_tier === m.tier ? "var(--text-primary)" : "var(--border)"}`,
              }}>
                <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{m.name}</div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{m.tier}</div>
              </button>
            ))}
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>System Prompt</label>
          <textarea value={form.system_prompt} onChange={(e) => update("system_prompt", e.target.value)} rows={5} placeholder="You are a sales manager agent. Your role is to..." className="w-full px-3 py-2 rounded-md text-sm" style={s} />
        </div>

        {/* Tools */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Tools (API Integrations)</label>
            <button onClick={() => update("tools", [...form.tools, { name: "", description: "", url: "", method: "POST", headers: "", parameters: "" }])} className="text-xs" style={{ color: "var(--accent-light, #3291ff)" }}>+ Add Tool</button>
          </div>
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
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>File upload coming soon</p>
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
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Max Tokens</label>
              <input type="number" value={form.max_tokens} onChange={(e) => update("max_tokens", parseInt(e.target.value))} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
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
  );
}
