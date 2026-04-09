"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function ChatPage() {
  const [message, setMessage] = useState("");
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = (await api.chat(message)) as Record<string, unknown>;
      setWorkflow(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate workflow");
    } finally {
      setLoading(false);
    }
  }

  async function handleStartRun() {
    if (!workflow?.id) return;
    try {
      await api.createWorkflow(workflow);
      await api.startRun(workflow.id as string);
      setWorkflow(null);
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run");
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Chat</h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Describe a business process and AI will generate a workflow
      </p>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="e.g. Process insurance claims: classify, extract, assess risk, decide..."
          disabled={loading}
          className="flex-1 px-4 py-3 rounded-lg text-sm"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !message.trim()}
          className="px-6 py-3 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </div>
      )}

      {workflow && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Generated Workflow: {(workflow.name as string) || "Unnamed"}
            </h3>
            <button
              onClick={handleStartRun}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "var(--success)" }}
            >
              Start Run
            </button>
          </div>
          <div className="rounded-xl p-4 overflow-auto" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <pre className="text-xs leading-relaxed" style={{ color: "var(--success)" }}>
              {JSON.stringify(workflow, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
