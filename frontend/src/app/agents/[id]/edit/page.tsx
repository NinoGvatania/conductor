"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function EditAgentPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "", description: "", purpose: "", provider: "anthropic", model_tier: "balanced",
    system_prompt: "", temperature: 0, timeout_seconds: 120, max_retries: 3, max_tokens: 4096,
    tools: [] as Array<{ name: string; description: string }>,
    knowledge_bases: [] as Array<{ name: string; type: string; source: string }>,
    is_public: false, tags: "",
  });

  useEffect(() => {
    api.getAgent(agentId).then((d: unknown) => {
      const a = d as Record<string, unknown>;
      setForm({
        name: (a.name as string) || "",
        description: (a.description as string) || "",
        purpose: (a.purpose as string) || "",
        provider: (a.provider as string) || "anthropic",
        model_tier: (a.model_tier as string) || "balanced",
        system_prompt: (a.system_prompt as string) || "",
        temperature: (a.temperature as number) || 0,
        timeout_seconds: (a.timeout_seconds as number) || 120,
        max_retries: (a.max_retries as number) || 3,
        max_tokens: (a.max_tokens as number) || 4096,
        tools: (a.tools as Array<{ name: string; description: string }>) || [],
        knowledge_bases: (a.knowledge_bases as Array<{ name: string; type: string; source: string }>) || [],
        is_public: (a.is_public as boolean) || false,
        tags: Array.isArray(a.tags) ? (a.tags as string[]).join(", ") : "",
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agentId]);

  function update(field: string, value: unknown) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateAgent(agentId, {
        ...form,
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
    <div className="max-w-2xl">
      <Link href={`/agents/${agentId}`} className="text-xs mb-2 inline-block" style={{ color: "var(--text-muted)" }}>← Back</Link>
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Edit Agent</h1>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Provider</label>
            <select value={form.provider} onChange={(e) => update("provider", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Description</label>
          <input value={form.description} onChange={(e) => update("description", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tier</label>
            <select value={form.model_tier} onChange={(e) => update("model_tier", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle}>
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="powerful">Powerful</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Temperature</label>
            <input type="number" value={form.temperature} onChange={(e) => update("temperature", parseFloat(e.target.value))} min={0} max={2} step={0.1} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Max Tokens</label>
            <input type="number" value={form.max_tokens} onChange={(e) => update("max_tokens", parseInt(e.target.value))} className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle} />
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>System Prompt</label>
          <textarea value={form.system_prompt} onChange={(e) => update("system_prompt", e.target.value)} rows={5} className="w-full px-3 py-2 rounded-md text-sm font-mono" style={inputStyle} />
        </div>

        {/* Tools */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Tools</label>
            <button onClick={() => update("tools", [...form.tools, { name: "", description: "" }])} className="text-xs" style={{ color: "var(--accent)" }}>+ Add</button>
          </div>
          {form.tools.map((t, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={t.name} onChange={(e) => { const arr = [...form.tools]; arr[i] = { ...arr[i], name: e.target.value }; update("tools", arr); }} placeholder="Name" className="flex-1 px-3 py-2 rounded-md text-sm" style={inputStyle} />
              <input value={t.description} onChange={(e) => { const arr = [...form.tools]; arr[i] = { ...arr[i], description: e.target.value }; update("tools", arr); }} placeholder="Description" className="flex-[2] px-3 py-2 rounded-md text-sm" style={inputStyle} />
              <button onClick={() => update("tools", form.tools.filter((_, j) => j !== i))} className="text-xs px-2" style={{ color: "var(--error)" }}>✕</button>
            </div>
          ))}
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
  );
}
