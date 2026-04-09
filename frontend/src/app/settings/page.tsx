"use client";

import { useState, useEffect } from "react";

export default function SettingsPage() {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("anthropic");
  const [maxCost, setMaxCost] = useState("2.00");
  const [maxTokens, setMaxTokens] = useState("100000");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
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

  const inputCls = "w-full px-3 py-2 rounded-md text-sm";
  const inputStyle = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Settings</h1>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>Default Provider</h3>
          <div className="flex gap-2">
            {["anthropic", "openai"].map((p) => (
              <button key={p} onClick={() => setDefaultProvider(p)} className="flex-1 px-3 py-2.5 rounded-md text-sm font-medium capitalize transition-colors" style={{ background: defaultProvider === p ? "var(--bg-hover)" : "var(--bg-card)", border: `1px solid ${defaultProvider === p ? "var(--text-primary)" : "var(--border)"}`, color: defaultProvider === p ? "var(--text-primary)" : "var(--text-muted)" }}>
                {p}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>API Keys</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Anthropic</label>
              <input type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>OpenAI</label>
              <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className={inputCls} style={inputStyle} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>Budget Limits</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Max cost per run (USD)</label>
              <input type="number" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} step="0.01" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Max tokens per run</label>
              <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} step="1000" className={inputCls} style={inputStyle} />
            </div>
          </div>
        </section>

        <button onClick={handleSave} className="px-4 py-2 rounded-md text-sm font-medium" style={{ background: saved ? "var(--success)" : "var(--text-primary)", color: "var(--bg-primary)" }}>
          {saved ? "Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
