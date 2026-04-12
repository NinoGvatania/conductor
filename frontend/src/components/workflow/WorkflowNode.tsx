"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

const typeColors: Record<string, string> = {
  trigger: "#f97316",
  agent: "#6366f1",
  deterministic: "#666",
  router: "#f59e0b",
  human: "#0cce6b",
  parallel: "#3b82f6",
  evaluator: "#ec4899",
};

const typeLabels: Record<string, string> = {
  trigger: "Trigger",
  agent: "Agent",
  deterministic: "Step",
  router: "Router",
  human: "Human",
  parallel: "Parallel",
  evaluator: "Evaluator",
};

function WorkflowNode({ data }: NodeProps) {
  const nodeType = (data.nodeType as string) || "agent";
  const color = typeColors[nodeType] || "#666";
  const isTrigger = nodeType === "trigger";
  const triggerType = (data.triggerType as string) || "";
  const triggerIcons: Record<string, string> = {
    telegram: "✈️",
    webhook: "🔗",
    manual: "▶️",
  };

  return (
    <div style={{
      background: isTrigger ? "#2a1a0a" : "#1c1c27",
      border: `2px solid ${color}`,
      borderRadius: isTrigger ? 16 : 12,
      padding: "12px 16px",
      minWidth: 160,
      color: "#ededed",
      fontSize: 13,
    }}>
      {/* Trigger nodes have no target handle — nothing flows INTO a trigger */}
      {!isTrigger && (
        <Handle type="target" position={Position.Top} style={{ background: color, width: 8, height: 8 }} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {isTrigger && triggerType && (
          <span style={{ fontSize: 14 }}>{triggerIcons[triggerType] || "⚡"}</span>
        )}
        <span style={{ background: color, borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#fff", fontWeight: 600 }}>
          {typeLabels[nodeType] || nodeType}
        </span>
      </div>
      <div style={{ fontWeight: 500, fontSize: 13 }}>{String(data.label || "")}</div>
      {data.agentName ? (
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{String(data.agentName)}</div>
      ) : null}
      {isTrigger && triggerType && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
          {triggerType === "telegram" ? "Bot messages" : triggerType === "webhook" ? "External POST" : "Manual input"}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 8, height: 8 }} />
    </div>
  );
}

export default memo(WorkflowNode);
