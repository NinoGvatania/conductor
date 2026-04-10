"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface GeneratedTool {
  name: string; description: string; url: string; method: string;
  headers: Record<string, string>; parameters: Record<string, unknown>;
}

interface WizardResult {
  app_name: string;
  description: string;
  base_url: string;
  auth_type: string;
  credential_keys: string[];
  tools: GeneratedTool[];
  count: number;
}

export default function NewToolPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"wizard" | "manual">("wizard");
  const [apiDocs, setApiDocs] = useState("");
  const [hint, setHint] = useState("");
  const [generating, setGenerating] = useState(false);
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Manual form
  const [form, setForm] = useState({ name: "", description: "", url: "", method: "POST", headers: "", parameters: "" });

  async function handleGenerate() {
    if (!apiDocs.trim()) return;
    setGenerating(true);
    try {
      const result = (await api.generateToolsFromDocs(apiDocs, hint)) as WizardResult;
      setWizardResult(result);
      // Initialize empty credentials
      const creds: Record<string, string> = {};
      (result.credential_keys || []).forEach((k) => { creds[k] = ""; });
      setCredentials(creds);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setGenerating(false); }
  }

  async function handleSaveIntegration() {
    if (!wizardResult) return;
    setSaving(true);
    try {
      // 1. Create connection with credentials
      const conn = (await api.createConnection({
        name: wizardResult.app_name,
        description: wizardResult.description,
        base_url: wizardResult.base_url,
        auth_type: wizardResult.auth_type,
        credentials,
      })) as { id: string };

      // 2. Create all tools linked to this connection
      for (const tool of wizardResult.tools) {
        await api.createTool({
          name: tool.name,
          description: tool.description,
          url: tool.url,
          method: tool.method,
          headers: tool.headers,
          parameters: tool.parameters,
          connection_id: conn.id,
        });
      }
      router.push("/tools");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleManualSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.createTool({
        name: form.name, description: form.description, url: form.url, method: form.method,
        headers: form.headers ? JSON.parse(form.headers) : {},
        parameters: form.parameters ? JSON.parse(form.parameters) : {},
      });
      router.push("/tools");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Create Integration</h1>

      <div className="flex gap-1 mb-6 p-0.5 rounded-md w-fit" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {(["wizard", "manual"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-3 py-1 rounded text-xs font-medium capitalize" style={{ background: tab === t ? "rgba(255,255,255,0.06)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-muted)" }}>
            {t === "wizard" ? "AI Wizard" : "Manual"}
          </button>
        ))}
      </div>

      {tab === "wizard" && !wizardResult && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Paste API documentation</label>
            <p className="text-[10px] mb-2" style={{ color: "#555" }}>Paste actual docs text (not just URL). Works with Swagger/OpenAPI specs or endpoint descriptions.</p>
            <textarea value={apiDocs} onChange={(e) => setApiDocs(e.target.value)} rows={8} placeholder="Telegram Bot API:..." className="w-full px-3 py-2 rounded-md text-sm font-mono" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Focus on (optional)</label>
            <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Only message sending methods" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <button onClick={handleGenerate} disabled={generating || !apiDocs.trim()} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
            {generating ? "Analyzing..." : "Generate Integration"}
          </button>
        </div>
      )}

      {tab === "wizard" && wizardResult && (
        <div className="space-y-4">
          {/* Integration header */}
          <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{wizardResult.app_name}</h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{wizardResult.description}</p>
            {wizardResult.base_url && (
              <p className="text-[10px] font-mono" style={{ color: "#555" }}>Base URL: {wizardResult.base_url}</p>
            )}
          </div>

          {/* Credentials */}
          {wizardResult.credential_keys && wizardResult.credential_keys.length > 0 && (
            <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h3 className="text-xs font-medium mb-3" style={{ color: "var(--text-primary)" }}>Credentials</h3>
              <p className="text-[10px] mb-3" style={{ color: "#555" }}>Enter your API credentials — they will be shared by all tools in this integration</p>
              {wizardResult.credential_keys.map((key) => (
                <div key={key} className="mb-2">
                  <label className="block text-[11px] mb-1 capitalize" style={{ color: "var(--text-muted)" }}>{key.replace(/_/g, " ")}</label>
                  <input
                    type="password"
                    value={credentials[key] || ""}
                    onChange={(e) => setCredentials({ ...credentials, [key]: e.target.value })}
                    placeholder={`Your ${key}`}
                    className="w-full px-3 py-2 rounded-md text-sm"
                    style={s}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Tools list */}
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2 text-xs font-medium" style={{ background: "var(--bg-card)", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
              {wizardResult.tools.length} Tools
            </div>
            {wizardResult.tools.map((tool, i) => (
              <div key={i} className="px-4 py-3" style={{ borderBottom: i < wizardResult.tools.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{tool.method}</span>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{tool.name}</span>
                </div>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{tool.description}</p>
                <p className="text-[10px] font-mono truncate" style={{ color: "#555" }}>{tool.url}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={handleSaveIntegration} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
              {saving ? "Creating..." : `Save Integration with ${wizardResult.tools.length} tools`}
            </button>
            <button onClick={() => { setWizardResult(null); setCredentials({}); }} className="px-4 py-2 rounded-md text-sm" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Back
            </button>
          </div>
        </div>
      )}

      {tab === "manual" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="send_telegram" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Method</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-full px-3 py-2 rounded-md text-sm" style={s}>
                <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>URL</label>
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Headers (JSON)</label>
            <textarea value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-md text-xs font-mono" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Parameters Schema (JSON)</label>
            <textarea value={form.parameters} onChange={(e) => setForm({ ...form, parameters: e.target.value })} rows={4} className="w-full px-3 py-2 rounded-md text-xs font-mono" style={s} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleManualSave} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
              {saving ? "Saving..." : "Create Tool"}
            </button>
            <button onClick={() => router.push("/tools")} className="px-4 py-2 rounded-md text-sm" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
