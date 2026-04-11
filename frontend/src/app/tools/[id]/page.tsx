"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ToolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toolId = params.id as string;
  const [tool, setTool] = useState<Record<string, unknown> | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", url: "", method: "POST", headers: "", parameters: "" });

  useEffect(() => {
    api.getTool(toolId).then((t) => {
      const data = t as Record<string, unknown>;
      setTool(data);
      setForm({
        name: (data.name as string) || "",
        description: (data.description as string) || "",
        url: (data.url as string) || "",
        method: (data.method as string) || "POST",
        headers: data.headers ? JSON.stringify(data.headers, null, 2) : "",
        parameters: data.parameters ? JSON.stringify(data.parameters, null, 2) : "",
      });
    }).catch((e) => console.error(e));
  }, [toolId]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateTool(toolId, {
        name: form.name, description: form.description, url: form.url, method: form.method,
        headers: form.headers ? JSON.parse(form.headers) : {},
        parameters: form.parameters ? JSON.parse(form.parameters) : {},
      });
      setEditing(false);
      api.getTool(toolId).then((t) => setTool(t as Record<string, unknown>));
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Delete this tool?")) return;
    await api.deleteTool(toolId);
    router.push("/tools");
  }

  if (!tool) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>;

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="max-w-2xl">
      <Link href="/tools" className="text-xs mb-3 inline-block" style={{ color: "var(--text-muted)" }}>← Tools</Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>{form.name}</h1>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>Edit</button>
              <button onClick={handleDelete} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "#ee0000", border: "1px solid var(--border)" }}>Delete</button>
            </>
          ) : (
            <>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>{saving ? "Saving..." : "Save"}</button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
          {editing ? <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-md text-sm" style={s} /> : <p className="text-sm" style={{ color: "var(--text-primary)" }}>{form.name}</p>}
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Description</label>
          {editing ? <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-md text-sm" style={s} /> : <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{form.description || "—"}</p>}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Method</label>
            {editing ? <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-full px-3 py-2 rounded-md text-sm" style={s}><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select> : <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{form.method}</p>}
          </div>
          <div className="col-span-3">
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>URL</label>
            {editing ? <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full px-3 py-2 rounded-md text-sm" style={s} /> : <p className="text-sm font-mono truncate" style={{ color: "var(--text-primary)" }}>{form.url || "—"}</p>}
          </div>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Headers</label>
          {editing ? <textarea value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-md text-xs font-mono" style={s} /> : <pre className="text-xs p-2 rounded overflow-auto" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>{form.headers || "{}"}</pre>}
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Parameters</label>
          {editing ? <textarea value={form.parameters} onChange={(e) => setForm({ ...form, parameters: e.target.value })} rows={5} className="w-full px-3 py-2 rounded-md text-xs font-mono" style={s} /> : <pre className="text-xs p-2 rounded overflow-auto" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>{form.parameters || "{}"}</pre>}
        </div>
      </div>
    </div>
  );
}
