"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatCost, formatDuration } from "@/lib/utils";

interface StepResult {
  node_id: string;
  status: string;
  agent_name: string | null;
  output: unknown;
  error: string | null;
  tokens_used: number;
  cost_usd: number;
  latency_ms: number;
  tool_calls: Array<Record<string, unknown>>;
  retries: number;
  guardrail_triggers: string[];
}

interface RunDetail {
  run_id: string;
  workflow_id: string;
  status: string;
  steps: StepResult[];
  total_tokens: number;
  total_cost_usd: number;
  total_steps: number;
}

const statusColors: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  paused: "bg-yellow-100 text-yellow-700",
  waiting_approval: "bg-orange-100 text-orange-700",
  pending: "bg-gray-100 text-gray-700",
};

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = (await api.getRun(runId)) as RunDetail;
        setRun(data);
      } catch {
        // API not available
      }
    }
    load();
  }, [runId]);

  async function handleApproval(decision: string) {
    try {
      await api.resolveApproval(runId, decision);
      const data = (await api.getRun(runId)) as RunDetail;
      setRun(data);
    } catch {
      // handle error
    }
  }

  if (!run) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Run Detail</h2>
        <div className="flex gap-4 mt-2">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[run.status] || "bg-gray-100"}`}
          >
            {run.status}
          </span>
          <span className="text-sm text-gray-500">
            Cost: {formatCost(run.total_cost_usd)}
          </span>
          <span className="text-sm text-gray-500">
            Tokens: {run.total_tokens.toLocaleString()}
          </span>
          <span className="text-sm text-gray-500">
            Steps: {run.total_steps}
          </span>
        </div>
      </div>

      {run.status === "paused" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 font-medium mb-2">
            Waiting for approval
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleApproval("approve")}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Approve
            </button>
            <button
              onClick={() => handleApproval("reject")}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Step Timeline
        </h3>
        {run.steps.map((step, i) => (
          <div
            key={step.node_id}
            className="bg-white border border-gray-200 rounded-lg"
          >
            <button
              onClick={() =>
                setExpandedStep(
                  expandedStep === step.node_id ? null : step.node_id
                )
              }
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm w-6">{i + 1}</span>
                <span className="font-medium text-sm">{step.node_id}</span>
                {step.agent_name && (
                  <span className="text-xs text-gray-500">
                    ({step.agent_name})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {formatDuration(step.latency_ms)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[step.status] || "bg-gray-100"}`}
                >
                  {step.status}
                </span>
              </div>
            </button>
            {expandedStep === step.node_id && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <div className="mt-3 space-y-2 text-sm">
                  {step.output !== null && step.output !== undefined && (
                    <div>
                      <p className="font-medium text-gray-700">Output:</p>
                      <pre className="bg-gray-50 p-2 rounded text-xs overflow-auto max-h-48">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </div>
                  )}
                  {step.error && (
                    <div>
                      <p className="font-medium text-red-700">Error:</p>
                      <p className="text-red-600 text-xs">{step.error}</p>
                    </div>
                  )}
                  {step.tool_calls.length > 0 && (
                    <div>
                      <p className="font-medium text-gray-700">Tool Calls:</p>
                      <pre className="bg-gray-50 p-2 rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(step.tool_calls, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Tokens: {step.tokens_used}</span>
                    <span>Cost: {formatCost(step.cost_usd)}</span>
                    <span>Retries: {step.retries}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {run.steps.length === 0 && (
          <p className="text-gray-500 text-sm">No steps recorded yet</p>
        )}
      </div>
    </div>
  );
}
