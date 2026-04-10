"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface GeneratedTool {
  name: string; description: string; url: string; method: string;
  headers: Record<string, string>; parameters: Record<string, unknown>;
}

export default function NewToolPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"wizard" | "manual">("wizard");
  const [apiDocs, setApiDocs] = useState("");
  const [hint, setHint] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedTools, setGeneratedTools] = useState<GeneratedTool[]>([]);
  const [saving, setSaving] = useState(false);

  // Manual form
  const [form, setForm] = useState({ name: "", description: "", url: "", method: "POST", headers: "", parameters: "" });
  function updateForm(f: string, v: string) { setForm((p) => ({ ...p, [f]: v })); }

  async function handleGenerate() {
    if (!apiDocs.trim()) return;
    setGenerating(true);
    try {
      const result = (await api.generateToolsFromDocs(apiDocs, hint)) as { tools: GeneratedTool[] };
      setGeneratedTools(result.tools);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setGenerating(false); }
  }

  async function handleSaveTool(tool: GeneratedTool) {
    setSaving(true);
    try {
      await api.createTool({
        name: tool.name, description: tool.description, url: tool.url,
        method: tool.method, headers: tool.headers, parameters: tool.parameters,
      });
      setGeneratedTools((prev) => prev.filter((t) => t.name !== tool.name));
      if (generatedTools.length <= 1) router.push("/tools");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      for (const tool of generatedTools) {
        await api.createTool({
          name: tool.name, description: tool.description, url: tool.url,
          method: tool.method, headers: tool.headers, parameters: tool.parameters,
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
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Create Tool</h1>

      <div className="flex gap-1 mb-6 p-0.5 rounded-md w-fit" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {(["wizard", "manual"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-3 py-1 rounded text-xs font-medium capitalize" style={{ background: tab === t ? "var(--bg-hover)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-muted)" }}>
            {t === "wizard" ? "AI Wizard" : "Manual"}
          </button>
        ))}
      </div>

      {tab === "wizard" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Paste API documentation or describe the API</label>
            <p className="text-[10px] mb-2" style={{ color: "#555" }}>Paste actual docs text (not just URL). Works best with Swagger/OpenAPI specs or endpoint descriptions.</p>
            <textarea value={apiDocs} onChange={(e) => setApiDocs(e.target.value)} rows={8} placeholder={"Telegram Bot API:\n\nPOST /sendMessage\n- chat_id (string, required)\n- text (string, required)\n\nPOST /sendPhoto\n- chat_id (string)\n- photo (string, URL)..."} className="w-full px-3 py-2 rounded-md text-sm font-mono" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Focus on (optional)</label>
            <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Only message sending methods" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <button onClick={handleGenerate} disabled={generating || !apiDocs.trim()} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
            {generating ? "Analyzing..." : "Generate Tools"}
          </button>

          {/* Generated tools */}
          {generatedTools.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Generated {generatedTools.length} tools</span>
                <button onClick={handleSaveAll} disabled={saving} className="text-xs px-3 py-1 rounded-md" style={{ background: "#0cce6b", color: "#000" }}>
                  Save All
                </button>
              </div>
              {generatedTools.map((tool, i) => (
                <div key={i} className="rounded-lg p-4 mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{tool.method}</span>
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{tool.name}</span>
                    </div>
                    <button onClick={() => handleSaveTool(tool)} disabled={saving} className="text-xs px-2 py-1 rounded" style={{ color: "#0cce6b", border: "1px solid var(--border)" }}>Save</button>
                  </div>
                  <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>{tool.description}</p>
                  <div className="text-[10px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{tool.url}</div>
                  {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-[10px] cursor-pointer" style={{ color: "var(--text-muted)" }}>Parameters</summary>
                      <pre className="text-[10px] mt-1 p-2 rounded overflow-auto" style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}>
                        {JSON.stringify(tool.parameters, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "manual" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
            <input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="send_telegram" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Description (for AI)</label>
            <textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} placeholder="Sends a message via Telegram Bot API" rows={2} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Method</label>
              <select value={form.method} onChange={(e) => updateForm("method", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={s}>
                <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>URL</label>
              <input value={form.url} onChange={(e) => updateForm("url", e.target.value)} placeholder="https://api.telegram.org/bot{'{token}'}/sendMessage" className="w-full px-3 py-2 rounded-md text-sm" style={s} />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Headers (JSON)</label>
            <textarea value={form.headers} onChange={(e) => updateForm("headers", e.target.value)} placeholder='{"Authorization": "Bearer your-token"}' rows={2} className="w-full px-3 py-2 rounded-md text-xs font-mono" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Parameters Schema (JSON)</label>
            <textarea value={form.parameters} onChange={(e) => updateForm("parameters", e.target.value)} placeholder='{"type":"object","properties":{"chat_id":{"type":"string"},"text":{"type":"string"}}}' rows={4} className="w-full px-3 py-2 rounded-md text-xs font-mono" style={s} />
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
