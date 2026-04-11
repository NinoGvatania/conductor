"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

interface Tool { id: string; name: string; description: string; url: string; method: string; }

export default function ConnectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const connId = params.id as string;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [form, setForm] = useState({
    name: "", description: "", base_url: "", auth_type: "api_key",
  });
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [newCredKey, setNewCredKey] = useState("");

  useEffect(() => {
    api.getConnection(connId).then((c) => {
      const data = c as Record<string, unknown>;
      setForm({
        name: (data.name as string) || "",
        description: (data.description as string) || "",
        base_url: (data.base_url as string) || "",
        auth_type: (data.auth_type as string) || "api_key",
      });
      const creds = (data.credentials as Record<string, string>) || {};
      // Masked credentials — set empty so user can fill new values
      const keyList: Record<string, string> = {};
      Object.keys(creds).forEach((k) => { keyList[k] = ""; });
      setCredentials(keyList);
    }).catch(console.error);

    api.getConnectionTools(connId).then((t) => setTools(t as Tool[])).catch(console.error);
  }, [connId]);

  async function handleSave() {
    setSaving(true);
    try {
      const update: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        base_url: form.base_url,
        auth_type: form.auth_type,
      };
      // Only send credentials if user actually typed new values
      const newCreds: Record<string, string> = {};
      let hasNew = false;
      for (const [k, v] of Object.entries(credentials)) {
        if (v.trim()) {
          newCreds[k] = v;
          hasNew = true;
        }
      }
      if (hasNew) {
        update.credentials = newCreds;
      }
      await api.updateConnection(connId, update);
      setEditing(false);
      // Reset credential inputs
      const cleared: Record<string, string> = {};
      Object.keys(credentials).forEach((k) => { cleared[k] = ""; });
      setCredentials(cleared);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Delete this integration and all its tools?")) return;
    await api.deleteConnection(connId);
    router.push("/tools");
  }

  function addCredentialKey() {
    if (!newCredKey.trim()) return;
    setCredentials((prev) => ({ ...prev, [newCredKey]: "" }));
    setNewCredKey("");
  }

  function removeCredentialKey(key: string) {
    setCredentials((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="max-w-3xl">
      <Link href="/tools" className="text-xs mb-3 inline-block" style={{ color: "var(--text-muted)" }}>← Integrations</Link>

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

      {/* Basic info */}
      <section className="rounded-lg p-5 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="text-xs font-medium mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Integration</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
            {editing ? <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-md text-sm" style={s} /> : <p className="text-sm" style={{ color: "var(--text-primary)" }}>{form.name}</p>}
          </div>
          <div>
            <label className="block text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Description</label>
            {editing ? <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-md text-sm" style={s} /> : <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{form.description || "—"}</p>}
          </div>
          <div>
            <label className="block text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Base URL</label>
            {editing ? <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} className="w-full px-3 py-2 rounded-md text-sm font-mono" style={s} /> : <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{form.base_url || "—"}</p>}
          </div>
          <div>
            <label className="block text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Auth Type</label>
            {editing ? (
              <select value={form.auth_type} onChange={(e) => setForm({ ...form, auth_type: e.target.value })} className="w-full px-3 py-2 rounded-md text-sm" style={s}>
                <option value="api_key">API Key</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="none">None</option>
              </select>
            ) : <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{form.auth_type}</p>}
          </div>
        </div>
      </section>

      {/* Credentials */}
      <section className="rounded-lg p-5 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="text-xs font-medium mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Credentials</h3>
        {Object.keys(credentials).length === 0 && !editing && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>No credential keys configured</p>
        )}
        {Object.keys(credentials).map((key) => (
          <div key={key} className="mb-2">
            <div className="flex items-center gap-2 mb-1">
              <label className="text-[11px] capitalize" style={{ color: "var(--text-muted)" }}>{key.replace(/_/g, " ")}</label>
              {editing && (
                <button onClick={() => removeCredentialKey(key)} className="text-[10px]" style={{ color: "#ee0000" }}>remove</button>
              )}
            </div>
            {editing ? (
              <input
                type="password"
                value={credentials[key]}
                onChange={(e) => setCredentials({ ...credentials, [key]: e.target.value })}
                placeholder="Leave empty to keep current value"
                className="w-full px-3 py-2 rounded-md text-sm"
                style={s}
              />
            ) : (
              <p className="text-sm font-mono" style={{ color: "var(--text-muted)" }}>••••••••</p>
            )}
          </div>
        ))}
        {editing && (
          <div className="mt-3 flex gap-2">
            <input
              value={newCredKey}
              onChange={(e) => setNewCredKey(e.target.value)}
              placeholder="New credential key (e.g. api_key)"
              className="flex-1 px-3 py-2 rounded-md text-sm"
              style={s}
            />
            <button onClick={addCredentialKey} className="px-3 py-2 rounded-md text-xs" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>+ Add</button>
          </div>
        )}
      </section>

      {/* Tools in this connection */}
      <section className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="px-4 py-3" style={{ background: "var(--bg-card)", borderBottom: tools.length > 0 ? "1px solid var(--border)" : "none" }}>
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Tools in this integration ({tools.length})</span>
        </div>
        {tools.map((t, i) => (
          <Link
            key={t.id}
            href={`/tools/${t.id}`}
            className="flex items-center gap-3 px-4 py-2.5"
            style={{ borderBottom: i < tools.length - 1 ? "1px solid var(--border)" : "none" }}
          >
            <span className="text-[10px] px-2 py-0.5 rounded font-mono w-14 text-center" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{t.method}</span>
            <span className="text-sm shrink-0" style={{ color: "var(--text-primary)" }}>{t.name}</span>
            <span className="text-xs truncate" style={{ color: "#555" }}>{t.description}</span>
          </Link>
        ))}
        {tools.length === 0 && (
          <div className="py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>No tools yet</div>
        )}
      </section>
    </div>
  );
}
