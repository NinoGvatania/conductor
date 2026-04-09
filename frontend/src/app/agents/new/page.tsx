"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Provider {
  id: string;
  name: string;
  models: Record<string, string>;
}

export default function NewAgentPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    purpose: "",
    provider: "anthropic",
    model_tier: "balanced",
    system_prompt: "",
    temperature: 0,
    timeout_seconds: 120,
    max_retries: 3,
    max_tokens: 4096,
    output_schema: "",
    tools: [] as Array<{ name: string; description: string; url: string; method: string; headers: string; parameters: string }>,
    knowledge_bases: [] as Array<{ name: string; type: string; source: string }>,
    is_public: false,
    tags: "",
  });

  useEffect(() => {
    api.listProviders().then((p) => setProviders(p as Provider[])).catch(() => {});
  }, []);

  function updateField(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addTool() {
    setForm((prev) => ({
      ...prev,
      tools: [...prev.tools, { name: "", description: "", url: "", method: "POST", headers: "", parameters: "" }],
    }));
  }

  function removeTool(index: number) {
    setForm((prev) => ({ ...prev, tools: prev.tools.filter((_, i) => i !== index) }));
  }

  function addKB() {
    setForm((prev) => ({
      ...prev,
      knowledge_bases: [...prev.knowledge_bases, { name: "", type: "text", source: "" }],
    }));
  }

  function removeKB(index: number) {
    setForm((prev) => ({ ...prev, knowledge_bases: prev.knowledge_bases.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      let schema = {};
      if (form.output_schema.trim()) {
        schema = JSON.parse(form.output_schema);
      }
      const parsedTools = form.tools.map((t) => ({
        name: t.name,
        description: t.description,
        url: t.url,
        method: t.method,
        headers: t.headers ? JSON.parse(t.headers) : {},
        parameters: t.parameters ? JSON.parse(t.parameters) : {},
      }));
      await api.createAgent({
        ...form,
        tools: parsedTools,
        output_schema: schema,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push("/agents");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Create Agent</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Configure your AI agent with tools and knowledge bases</p>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Basic Info</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Name</label>
              <input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g. Invoice Processor" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Description</label>
              <input value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="What does this agent do?" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Purpose</label>
              <input value={form.purpose} onChange={(e) => updateField("purpose", e.target.value)} placeholder="Why does this agent exist?" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Tags (comma-separated)</label>
              <input value={form.tags} onChange={(e) => updateField("tags", e.target.value)} placeholder="finance, extraction, validation" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
          </div>
        </section>

        {/* Model Config */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Model Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Provider</label>
              <select value={form.provider} onChange={(e) => updateField("provider", e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                {providers.length === 0 && (
                  <>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Model Tier</label>
              <select value={form.model_tier} onChange={(e) => updateField("model_tier", e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle}>
                <option value="fast">Fast (cheap, simple tasks)</option>
                <option value="balanced">Balanced (good default)</option>
                <option value="powerful">Powerful (complex reasoning)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Temperature</label>
              <input type="number" value={form.temperature} onChange={(e) => updateField("temperature", parseFloat(e.target.value))} min={0} max={2} step={0.1} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Max Tokens</label>
              <input type="number" value={form.max_tokens} onChange={(e) => updateField("max_tokens", parseInt(e.target.value))} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
          </div>
        </section>

        {/* System Prompt */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>System Prompt</h3>
          <textarea value={form.system_prompt} onChange={(e) => updateField("system_prompt", e.target.value)} rows={6} placeholder="You are a specialist agent that..." className="w-full px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
        </section>

        {/* Tools */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Tools</h3>
            <button onClick={addTool} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}>
              + Add Tool
            </button>
          </div>
          {form.tools.length === 0 && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>No tools added. Add API integrations so the agent can interact with external systems (CRM, messengers, databases).</p>
          )}
          {form.tools.map((tool, i) => (
            <div key={i} className="rounded-lg p-4 mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <div className="flex justify-between mb-3">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Tool #{i + 1}</span>
                <button onClick={() => removeTool(i)} className="text-xs" style={{ color: "var(--error)" }}>Remove</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input value={tool.name} onChange={(e) => { const t = [...form.tools]; t[i] = {...t[i], name: e.target.value}; updateField("tools", t); }} placeholder="Name (e.g. send_telegram)" className="px-3 py-2 rounded-md text-sm" style={inputStyle} />
                <div className="flex gap-2">
                  <select value={tool.method} onChange={(e) => { const t = [...form.tools]; t[i] = {...t[i], method: e.target.value}; updateField("tools", t); }} className="px-3 py-2 rounded-md text-sm w-24" style={inputStyle}>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <input value={tool.url} onChange={(e) => { const t = [...form.tools]; t[i] = {...t[i], url: e.target.value}; updateField("tools", t); }} placeholder="API URL (https://api.example.com/...)" className="flex-1 px-3 py-2 rounded-md text-sm" style={inputStyle} />
                </div>
              </div>
              <input value={tool.description} onChange={(e) => { const t = [...form.tools]; t[i] = {...t[i], description: e.target.value}; updateField("tools", t); }} placeholder="Description for AI: what this tool does, when to use it" className="w-full px-3 py-2 rounded-md text-sm mb-2" style={inputStyle} />
              <input value={tool.headers} onChange={(e) => { const t = [...form.tools]; t[i] = {...t[i], headers: e.target.value}; updateField("tools", t); }} placeholder='Headers JSON: {"Authorization": "Bearer token123", "Content-Type": "application/json"}' className="w-full px-3 py-2 rounded-md text-xs font-mono mb-2" style={inputStyle} />
              <input value={tool.parameters} onChange={(e) => { const t = [...form.tools]; t[i] = {...t[i], parameters: e.target.value}; updateField("tools", t); }} placeholder='Parameters schema JSON: {"type":"object","properties":{"message":{"type":"string"},"chat_id":{"type":"string"}}}' className="w-full px-3 py-2 rounded-md text-xs font-mono" style={inputStyle} />
            </div>
          ))}
        </section>

        {/* Knowledge Bases */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Knowledge Bases</h3>
            <button onClick={addKB} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}>
              + Add Knowledge Base
            </button>
          </div>
          {form.knowledge_bases.length === 0 && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>No knowledge bases. Connect documents for the agent to reference.</p>
          )}
          {form.knowledge_bases.map((kb, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={kb.name} onChange={(e) => { const k = [...form.knowledge_bases]; k[i].name = e.target.value; updateField("knowledge_bases", k); }} placeholder="Name" className="flex-1 px-3 py-2 rounded-lg text-sm" style={inputStyle} />
              <select value={kb.type} onChange={(e) => { const k = [...form.knowledge_bases]; k[i].type = e.target.value; updateField("knowledge_bases", k); }} className="px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                <option value="text">Text</option>
                <option value="url">URL</option>
                <option value="file">File</option>
              </select>
              <input value={kb.source} onChange={(e) => { const k = [...form.knowledge_bases]; k[i].source = e.target.value; updateField("knowledge_bases", k); }} placeholder="Source/content" className="flex-[2] px-3 py-2 rounded-lg text-sm" style={inputStyle} />
              <button onClick={() => removeKB(i)} className="px-3 py-2 rounded-lg text-sm" style={{ color: "var(--error)" }}>✕</button>
            </div>
          ))}
        </section>

        {/* Sharing */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sharing</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.is_public} onChange={(e) => updateField("is_public", e.target.checked)} className="w-4 h-4 rounded" />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Make this agent public</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Other users can clone and use this agent</p>
            </div>
          </label>
        </section>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving || !form.name.trim()} className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {saving ? "Creating..." : "Create Agent"}
          </button>
          <button onClick={() => router.push("/agents")} className="px-6 py-2.5 rounded-lg text-sm font-medium" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
