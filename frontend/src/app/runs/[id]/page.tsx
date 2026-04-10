"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCost, formatDuration } from "@/lib/utils";

interface StepResult {
  node_id: string; status: string; agent_name: string | null;
  output: unknown; error: string | null; tokens_used: number;
  cost_usd: number; latency_ms: number;
  tool_calls: Array<Record<string, unknown>>; retries: number;
}
interface RunDetail {
  run_id: string; workflow_id: string; status: string;
  steps: StepResult[]; total_tokens: number; total_cost_usd: number; total_steps: number;
}

const dot: Record<string, string> = { running: "#3b82f6", completed: "#0cce6b", failed: "#ee0000", paused: "#f5a623", waiting_approval: "#f59e0b", pending: "#666" };

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.getRun(runId).then((d) => setRun(d as RunDetail)).catch((e) => console.error(e));
  }, [runId]);

  if (!run) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div>
      <Link href="/" className="text-xs mb-3 inline-block" style={{ color: "var(--text-muted)" }}>← Dashboard</Link>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Run Detail</h1>
        <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full" style={{ background: (dot[run.status] || "#666") + "18", color: dot[run.status] || "#666" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot[run.status] }} />
          {run.status}
        </span>
      </div>

      <div className="flex gap-4 mb-6 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>Cost: {formatCost(run.total_cost_usd)}</span>
        <span>Tokens: {run.total_tokens.toLocaleString()}</span>
        <span>Steps: {run.total_steps}</span>
      </div>

      {/* Step Timeline */}
      <div className="space-y-1">
        <div className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Step Timeline</div>
        {run.steps.map((step, i) => (
          <div key={step.node_id} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button
              onClick={() => setExpanded(expanded === step.node_id ? null : step.node_id)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
              style={{ background: "var(--bg-card)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs w-5 text-center" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{step.node_id}</span>
                {step.agent_name && <span className="text-xs" style={{ color: "var(--text-muted)" }}>({step.agent_name})</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{formatDuration(step.latency_ms)}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: (dot[step.status] || "#666") + "18", color: dot[step.status] || "#666" }}>
                  {step.status}
                </span>
              </div>
            </button>
            {expanded === step.node_id && (
              <div className="px-4 pb-4 pt-2 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
                {step.output !== null && step.output !== undefined && (
                  <div>
                    <div className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Output</div>
                    <pre className="p-2 rounded text-xs overflow-auto max-h-48" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
                  </div>
                )}
                {step.error && (
                  <div>
                    <div className="text-[10px] font-medium mb-1" style={{ color: "#ee0000" }}>Error</div>
                    <p className="text-xs" style={{ color: "#ee0000" }}>{step.error}</p>
                  </div>
                )}
                <div className="flex gap-4 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span>Tokens: {step.tokens_used}</span>
                  <span>Cost: {formatCost(step.cost_usd)}</span>
                  <span>Retries: {step.retries}</span>
                </div>
              </div>
            )}
          </div>
        ))}
        {run.steps.length === 0 && <div className="text-xs" style={{ color: "var(--text-muted)" }}>No steps recorded</div>}
      </div>
    </div>
  );
}
