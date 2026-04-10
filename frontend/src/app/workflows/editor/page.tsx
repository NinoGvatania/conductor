"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import type { Node, Edge } from "@xyflow/react";

const WorkflowEditor = dynamic(() => import("@/components/workflow/WorkflowEditor"), { ssr: false });

export default function WorkflowEditorPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("New Workflow");

  async function handleSave(nodes: Node[], edges: Edge[]) {
    setSaving(true);
    try {
      // Convert visual nodes/edges to WorkflowDefinition
      const workflowNodes = nodes.map((n) => {
        const targets = edges.filter((e) => e.source === n.id).map((e) => e.target);
        return {
          id: n.id,
          type: (n.data.nodeType as string) || "deterministic",
          agent_name: (n.data.agentName as string) || null,
          next_nodes: targets,
          condition: null,
          parallel_nodes: [],
          timeout_seconds: 120,
          config: {},
        };
      });

      const entryNode = nodes.length > 0 ? nodes[0].id : "";

      const workflow = {
        id: crypto.randomUUID(),
        name,
        version: "1.0.0",
        entry_node: entryNode,
        nodes: workflowNodes,
        max_total_cost_usd: 2.0,
        max_total_steps: 50,
      };

      await api.createWorkflow(workflow);
      router.push("/workflows");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="-m-6 h-[calc(100vh-48px)] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-2 py-1 rounded text-sm w-64"
          style={inputStyle}
        />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {saving ? "Saving..." : "Drag nodes from the left panel. Connect by dragging handles."}
        </span>
      </div>
      {/* Editor */}
      <div className="flex-1">
        <WorkflowEditor onSave={handleSave} />
      </div>
    </div>
  );
}
