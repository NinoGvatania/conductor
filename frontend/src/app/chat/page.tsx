"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function ChatPage() {
  const [message, setMessage] = useState("");
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(
    null
  );
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
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Chat</h2>
      <p className="text-gray-600 mb-4">
        Describe your business process and AI will generate a workflow.
      </p>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Describe your process..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !message.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Generating..." : "Send"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {workflow && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Generated Workflow</h3>
            <button
              onClick={handleStartRun}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Start Run
            </button>
          </div>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-md overflow-auto text-sm max-h-96">
            {JSON.stringify(workflow, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
