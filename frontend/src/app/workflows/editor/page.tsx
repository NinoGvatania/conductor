"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import type { Node, Edge } from "@xyflow/react";
import BuilderChat from "@/components/BuilderChat";

const WorkflowEditor = dynamic(() => import("@/components/workflow/WorkflowEditor"), { ssr: false });

export default function WorkflowEditorPage() {
  return <Suspense><EditorContent /></Suspense>;
}

function EditorContent() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("New Workflow");
  const [description, setDescription] = useState("");
  const [showChat, setShowChat] = useState(false);

  async function handleSave(nodes: Node[], edges: Edge[]) {
    setSaving(true);
    try {
      // Build edge descriptions map: "source->target" -> description
      const edgeDescriptions: Record<string, string> = {};
      for (const e of edges) {
        const desc = (e.data as Record<string, unknown> | undefined)?.description;
        if (desc && typeof desc === "string") {
          edgeDescriptions[`${e.source}->${e.target}`] = desc;
        }
      }

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
        description,
        version: "1.0.0",
        entry_node: entryNode,
        nodes: workflowNodes,
        edge_descriptions: edgeDescriptions,
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
          placeholder="Workflow name"
          className="px-2 py-1 rounded text-sm w-48"
          style={inputStyle}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this workflow do?"
          className="px-2 py-1 rounded text-sm flex-1"
          style={inputStyle}
        />
        <button
          onClick={() => setShowChat(!showChat)}
          className="px-2 py-1 rounded text-xs"
          style={{ color: showChat ? "var(--text-primary)" : "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          {showChat ? "Hide AI" : "AI Helper"}
        </button>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {saving ? "Saving..." : "Drag nodes → connect → explain each connection"}
        </span>
      </div>

      {/* Editor + optional chat */}
      <div className="flex-1 flex">
        <div className="flex-1">
          <WorkflowEditor onSave={handleSave} />
        </div>
        {showChat && (
          <div className="w-80" style={{ borderLeft: "1px solid var(--border)" }}>
            <BuilderChat contextType="workflow_builder" title="Design with AI" placeholder="Describe your workflow..." />
          </div>
        )}
      </div>
    </div>
  );
}
