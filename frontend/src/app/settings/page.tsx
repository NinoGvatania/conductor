"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface Provider {
  id: string;
  name: string;
  models: Record<string, string>;
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("anthropic");
  const [maxCost, setMaxCost] = useState("2.00");
  const [maxTokens, setMaxTokens] = useState("100000");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.listProviders().then((p) => setProviders(p as Provider[])).catch(() => {});
    setAnthropicKey(localStorage.getItem("agentflow_anthropic_key") || "");
    setOpenaiKey(localStorage.getItem("agentflow_openai_key") || "");
    setDefaultProvider(localStorage.getItem("agentflow_default_provider") || "anthropic");
    setMaxCost(localStorage.getItem("agentflow_max_cost") || "2.00");
    setMaxTokens(localStorage.getItem("agentflow_max_tokens") || "100000");
  }, []);

  function handleSave() {
    localStorage.setItem("agentflow_anthropic_key", anthropicKey);
    localStorage.setItem("agentflow_openai_key", openaiKey);
    localStorage.setItem("agentflow_default_provider", defaultProvider);
    localStorage.setItem("agentflow_max_cost", maxCost);
    localStorage.setItem("agentflow_max_tokens", maxTokens);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputStyle = {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Settings</h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>Configure API keys, providers, and budget limits</p>

      <div className="space-y-6">
        {/* Provider Selection */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Default LLM Provider</h3>
          <div className="grid grid-cols-2 gap-3">
            {(providers.length > 0 ? providers : [{ id: "anthropic", name: "Anthropic" }, { id: "openai", name: "OpenAI" }]).map((p) => (
              <button
                key={p.id}
                onClick={() => setDefaultProvider(p.id)}
                className="rounded-lg p-4 text-left transition-all"
                style={{
                  background: defaultProvider === p.id ? "var(--bg-hover)" : "var(--bg-secondary)",
                  border: `2px solid ${defaultProvider === p.id ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {p.id === "anthropic" ? "Claude Haiku / Sonnet / Opus" : "GPT-4o Mini / GPT-4o / o3"}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* API Keys */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>API Keys</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Anthropic API Key</label>
              <input type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>OpenAI API Key</label>
              <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
          </div>
        </section>

        {/* Budget */}
        <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Budget Limits</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Max Cost per Run (USD)</label>
              <input type="number" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} step="0.01" min="0" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Max Tokens per Run</label>
              <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} step="1000" min="0" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
          </div>
        </section>

        <button onClick={handleSave} className="px-6 py-2.5 rounded-lg text-sm font-medium text-white" style={{ background: saved ? "var(--success)" : "var(--accent)" }}>
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
