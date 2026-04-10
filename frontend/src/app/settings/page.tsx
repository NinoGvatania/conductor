"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ProviderInfo { id: string; name: string; description: string; models: Array<{ id: string; name: string; tier: string }>; auth_type: string; auth_placeholder: string; }
interface ConnectedProvider { id: string; provider: string; is_active: boolean; }

export default function SettingsPage() {
  const [catalog, setCatalog] = useState<ProviderInfo[]>([]);
  const [connected, setConnected] = useState<ConnectedProvider[]>([]);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getProviderCatalog().then((c) => setCatalog(c as ProviderInfo[])).catch((e) => console.error(e));
    api.listConnectedProviders().then((c) => setConnected(c as ConnectedProvider[])).catch((e) => console.error(e));
  }, []);

  function isConnected(providerId: string): boolean {
    return connected.some((c) => c.provider === providerId && c.is_active);
  }

  async function handleConnect(providerId: string) {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await api.connectProvider(providerId, apiKey, baseUrl);
      api.listConnectedProviders().then((c) => setConnected(c as ConnectedProvider[]));
      setApiKey("");
      setBaseUrl("");
      setExpandedProvider(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  async function handleDisconnect(providerId: string) {
    const conn = connected.find((c) => c.provider === providerId);
    if (conn) {
      await api.disconnectProvider(conn.id);
      setConnected((prev) => prev.map((c) => c.id === conn.id ? { ...c, is_active: false } : c));
    }
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-1" style={{ color: "var(--text-primary)" }}>Settings</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Connect LLM providers to power your agents</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {catalog.map((p) => {
          const active = isConnected(p.id);
          const expanded = expandedProvider === p.id;
          return (
            <div key={p.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${active ? "#0cce6b" : "var(--border)"}`, background: "var(--bg-card)" }}>
              <button
                onClick={() => setExpandedProvider(expanded ? null : p.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                    background: active ? "rgba(12,206,107,0.1)" : "var(--bg-hover)",
                    color: active ? "#0cce6b" : "var(--text-muted)",
                  }}>
                    {active ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{p.description}</p>
                {p.models.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {p.models.map((m) => (
                      <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                        {m.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              {expanded && (
                <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="pt-3 space-y-2">
                    <input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={p.auth_placeholder}
                      type="password"
                      className="w-full px-3 py-2 rounded-md text-sm"
                      style={s}
                    />
                    {p.auth_type === "api_key_and_url" && (
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://your-api.com/v1"
                        className="w-full px-3 py-2 rounded-md text-sm"
                        style={s}
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConnect(p.id)}
                        disabled={saving || !apiKey.trim()}
                        className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
                        style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
                      >
                        {saving ? "Connecting..." : "Connect"}
                      </button>
                      {active && (
                        <button
                          onClick={() => handleDisconnect(p.id)}
                          className="px-3 py-1.5 rounded-md text-xs"
                          style={{ color: "#ee0000", border: "1px solid var(--border)" }}
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
