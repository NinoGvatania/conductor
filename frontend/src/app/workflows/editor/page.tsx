"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { useProject } from "@/contexts/ProjectContext";
import type { Node, Edge } from "@xyflow/react";
import BuilderChat from "@/components/BuilderChat";

const WorkflowEditor = dynamic(() => import("@/components/workflow/WorkflowEditor"), { ssr: false });

interface StoredNode {
  id: string;
  type: string;
  agent_name: string | null;
  next_nodes: string[];
  config?: Record<string, unknown>;
}

interface StoredWorkflow {
  name: string;
  description?: string;
  entry_node: string;
  nodes: StoredNode[];
  edge_descriptions?: Record<string, string>;
}

interface LoadedWorkflow {
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
}

function parseWorkflowDefinition(definitionJson: string): LoadedWorkflow | null {
  try {
    const def = JSON.parse(definitionJson) as StoredWorkflow;
    const edgeDescriptions = def.edge_descriptions || {};

    const nodes: Node[] = def.nodes.map((n, i) => ({
      id: n.id,
      type: "custom",
      position: {
        x: 100 + (i % 4) * 220,
        y: n.type === "trigger" ? 30 : 100 + Math.floor(i / 4) * 160,
      },
      data: {
        label: n.agent_name || n.id,
        nodeType: n.type,
        agentName: n.agent_name,
        triggerType: n.config?.trigger_type || undefined,
        bot_token: n.config?.bot_token || undefined,
        public_url: n.config?.public_url || undefined,
      },
    }));

    const edges: Edge[] = [];
    for (const n of def.nodes) {
      for (const target of n.next_nodes || []) {
        const key = `${n.id}->${target}`;
        const description = edgeDescriptions[key] || "";
        edges.push({
          id: `${n.id}-${target}`,
          source: n.id,
          target,
          animated: true,
          style: { stroke: "#444", strokeWidth: 2 },
          label: description || undefined,
          labelStyle: { fill: "#888", fontSize: 10 },
          labelBgStyle: { fill: "#1c1c27" },
          data: { description },
        });
      }
    }

    return {
      name: def.name,
      description: def.description || "",
      nodes,
      edges,
    };
  } catch (e) {
    console.error("parse workflow definition failed", e);
    return null;
  }
}

export default function WorkflowEditorPage() {
  return (
    <Suspense>
      <EditorContent />
    </Suspense>
  );
}

function EditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projectId } = useProject();
  const workflowId = searchParams.get("id");

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("New Workflow");
  const [description, setDescription] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [initialNodes, setInitialNodes] = useState<Node[]>([]);
  const [initialEdges, setInitialEdges] = useState<Edge[]>([]);
  // Bump this to force the visual editor to remount when we load or reload
  // the workflow — @xyflow/react only reads initialNodes on mount.
  const [editorKey, setEditorKey] = useState(0);
  const [loaded, setLoaded] = useState(!workflowId);

  const loadWorkflow = useCallback(async () => {
    if (!workflowId) return;
    try {
      const w = (await api.getWorkflow(workflowId)) as {
        name: string;
        definition_json: string;
      };
      const parsed = parseWorkflowDefinition(w.definition_json);
      if (parsed) {
        setName(parsed.name);
        setDescription(parsed.description);
        setInitialNodes(parsed.nodes);
        setInitialEdges(parsed.edges);
        setEditorKey((k) => k + 1);
      }
      setLoaded(true);
    } catch (e) {
      console.error("failed to load workflow", e);
      setLoaded(true);
    }
  }, [workflowId]);

  useEffect(() => {
    loadWorkflow();
  }, [loadWorkflow]);

  async function handleSave(nodes: Node[], edges: Edge[]) {
    setSaving(true);
    try {
      const edgeDescriptions: Record<string, string> = {};
      for (const e of edges) {
        const desc = (e.data as Record<string, unknown> | undefined)?.description;
        if (desc && typeof desc === "string") {
          edgeDescriptions[`${e.source}->${e.target}`] = desc;
        }
      }

      const workflowNodes = nodes.map((n) => {
        const targets = edges.filter((e) => e.source === n.id).map((e) => e.target);
        const nodeType = (n.data.nodeType as string) || "deterministic";
        // For trigger nodes, store trigger config (type, bot_token etc) in
        // the node's config dict so the backend trigger handler can read it.
        const config: Record<string, unknown> = {};
        if (nodeType === "trigger") {
          if (n.data.triggerType) config.trigger_type = n.data.triggerType;
          if (n.data.bot_token) config.bot_token = n.data.bot_token;
          if (n.data.public_url) config.public_url = n.data.public_url;
        }
        return {
          id: n.id,
          type: nodeType,
          agent_name: (n.data.agentName as string) || null,
          next_nodes: targets,
          condition: null,
          parallel_nodes: [],
          timeout_seconds: 120,
          config,
        };
      });

      // Prefer a trigger node as entry_node if one exists, otherwise first node
      const triggerNode = nodes.find((n) => n.data.nodeType === "trigger");
      const entryNode = triggerNode ? triggerNode.id : (nodes.length > 0 ? nodes[0].id : "");

      const workflow = {
        id: workflowId || crypto.randomUUID(),
        name,
        description,
        version: "1.0.0",
        entry_node: entryNode,
        nodes: workflowNodes,
        edge_descriptions: edgeDescriptions,
        max_total_cost_usd: 10_000,
        max_total_steps: 1000,
      };

      if (workflowId) {
        await api.updateWorkflow(workflowId, workflow);
      } else {
        await api.createWorkflow(workflow, projectId || undefined);
      }
      router.push("/workflows");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  if (!loaded) {
    return (
      <div className="-m-6 h-[calc(100vh-48px)] flex items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading workflow…
        </p>
      </div>
    );
  }

  return (
    <div className="-m-6 h-[calc(100vh-48px)] flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
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
          style={{
            color: showChat ? "var(--text-primary)" : "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
        >
          {showChat ? "Hide AI" : "AI Helper"}
        </button>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {saving ? "Saving..." : "Drag nodes → connect → explain each connection"}
        </span>
      </div>

      {/* Editor + chat */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          <WorkflowEditor
            key={editorKey}
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            onSave={handleSave}
            projectId={projectId || undefined}
          />
        </div>
        {showChat && (
          <div className="w-80 flex-shrink-0" style={{ borderLeft: "1px solid var(--border)" }}>
            <BuilderChat
              contextType="workflow_builder"
              contextId={workflowId || undefined}
              title="Design Workflow with AI"
              placeholder="Describe the workflow or change..."
              onEntityCreated={(entity) => {
                if (entity.type !== "workflow") return;
                if (workflowId && entity.id === workflowId) {
                  // Same workflow updated — reload canvas
                  loadWorkflow();
                } else {
                  // New workflow created from blank editor — jump to its edit URL
                  router.push(`/workflows/editor?id=${entity.id}`);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
