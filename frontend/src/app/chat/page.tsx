"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function ChatPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSend() {
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      setWorkflow((await api.chat(message)) as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  async function handleStartRun() {
    if (!workflow?.id) return;
    setDeploying(true);
    setError("");
    try {
      const saved = (await api.createWorkflow(workflow)) as { id: string };
      await api.startRun(saved.id);
      setSuccess(`Workflow deployed! Run started.`);
      setWorkflow(null);
      setMessage("");
      setTimeout(() => router.push("/runs"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deploy workflow");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1" style={{ color: "var(--text-primary)" }}>Chat</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Describe a business process to generate a workflow</p>

      <div className="flex gap-2 mb-6">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Process insurance claims: classify, extract, assess risk, decide..."
          disabled={loading || deploying}
          className="flex-1 px-3 py-2 rounded-md text-sm"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />
        <button onClick={handleSend} disabled={loading || deploying || !message.trim()} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {error && <div className="text-sm mb-4 px-3 py-2 rounded-md" style={{ color: "var(--error)", background: "rgba(238,0,0,0.08)", border: "1px solid rgba(238,0,0,0.15)" }}>{error}</div>}
      {success && <div className="text-sm mb-4 px-3 py-2 rounded-md" style={{ color: "var(--success)", background: "rgba(12,206,107,0.08)", border: "1px solid rgba(12,206,107,0.15)" }}>{success}</div>}

      {workflow && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{(workflow.name as string) || "Generated Workflow"}</span>
            <button
              onClick={handleStartRun}
              disabled={deploying}
              className="px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50"
              style={{ background: deploying ? "var(--text-muted)" : "var(--success)", color: "#000" }}
            >
              {deploying ? "Deploying..." : "Deploy"}
            </button>
          </div>
          <pre className="p-4 text-xs overflow-auto max-h-[500px] leading-relaxed" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
            {JSON.stringify(workflow, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
