"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function NewToolPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", url: "", method: "POST", headers: "", parameters: "", is_public: false,
  });

  function update(f: string, v: unknown) { setForm((p) => ({ ...p, [f]: v })); }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.createTool({
        name: form.name, description: form.description, url: form.url, method: form.method,
        headers: form.headers ? JSON.parse(form.headers) : {},
        parameters: form.parameters ? JSON.parse(form.parameters) : {},
        is_public: form.is_public,
      });
      router.push("/tools");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Create Tool</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="send_telegram" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Description (for AI — when and why to use this tool)</label>
          <textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Sends a message via Telegram Bot API to the specified chat" rows={3} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Method</label>
            <select value={form.method} onChange={(e) => update("method", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={s}>
              <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
            </select>
          </div>
          <div className="col-span-3">
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>URL</label>
            <input value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://api.telegram.org/bot{'{token}'}/sendMessage" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Headers (JSON)</label>
          <textarea value={form.headers} onChange={(e) => update("headers", e.target.value)} placeholder='{"Authorization": "Bearer your-token"}' rows={2} className="w-full px-3 py-2 rounded-md text-xs font-mono" style={s} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Parameters Schema (JSON — describes what the AI can pass)</label>
          <textarea value={form.parameters} onChange={(e) => update("parameters", e.target.value)} placeholder='{"type":"object","properties":{"chat_id":{"type":"string","description":"Telegram chat ID"},"text":{"type":"string","description":"Message text"}}}' rows={3} className="w-full px-3 py-2 rounded-md text-xs font-mono" style={s} />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
            {saving ? "Saving..." : "Create Tool"}
          </button>
          <button onClick={() => router.push("/tools")} className="px-4 py-2 rounded-md text-sm" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
