"use client";

import { useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import WorkflowNode from "./WorkflowNode";
import { api } from "@/lib/api";

const nodeTypes = { custom: WorkflowNode };

const BUILTIN_TEMPLATES = [
  { nodeType: "deterministic", label: "Intake", agentName: null },
  { nodeType: "agent", label: "Classify", agentName: "classifier" },
  { nodeType: "agent", label: "Extract", agentName: "extractor" },
  { nodeType: "agent", label: "Validate", agentName: "validator" },
  { nodeType: "agent", label: "Risk Score", agentName: "risk_scorer" },
  { nodeType: "agent", label: "Decide", agentName: "decision_maker" },
  { nodeType: "agent", label: "Draft", agentName: "draft_writer" },
  { nodeType: "router", label: "Router", agentName: null },
  { nodeType: "human", label: "Human Review", agentName: null },
  { nodeType: "parallel", label: "Parallel", agentName: null },
];

interface WorkflowEditorProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave?: (nodes: Node[], edges: Edge[]) => void;
}

export default function WorkflowEditor({ initialNodes, initialEdges, onSave }: WorkflowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges || []);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [customAgents, setCustomAgents] = useState<Array<{ name: string; description: string }>>([]);

  // Modal for edge description
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [edgeDescription, setEdgeDescription] = useState("");

  useEffect(() => {
    api.listAgents().then((agents) => {
      const custom = (agents as Array<Record<string, unknown>>)
        .filter((a) => !a.is_builtin)
        .map((a) => ({ name: a.name as string, description: (a.description as string) || "" }));
      setCustomAgents(custom);
    }).catch(() => {});
  }, []);

  const onConnect = useCallback((params: Connection) => {
    // Open modal to ask for edge description
    setPendingConnection(params);
    setEdgeDescription("");
  }, []);

  function confirmConnection() {
    if (!pendingConnection) return;
    const newEdge: Edge = {
      id: `${pendingConnection.source}-${pendingConnection.target}-${Date.now()}`,
      source: pendingConnection.source!,
      target: pendingConnection.target!,
      sourceHandle: pendingConnection.sourceHandle,
      targetHandle: pendingConnection.targetHandle,
      style: { stroke: "#444", strokeWidth: 2 },
      animated: true,
      label: edgeDescription || undefined,
      labelStyle: { fill: "#888", fontSize: 10 },
      labelBgStyle: { fill: "#1c1c27" },
      data: { description: edgeDescription },
    };
    setEdges((eds) => addEdge(newEdge, eds));
    setPendingConnection(null);
    setEdgeDescription("");
  }

  function cancelConnection() {
    setPendingConnection(null);
    setEdgeDescription("");
  }

  function addNode(template: { nodeType: string; label: string; agentName: string | null }) {
    const id = `node_${Date.now()}`;
    const newNode: Node = {
      id, type: "custom",
      position: { x: 250 + Math.random() * 200, y: 100 + nodes.length * 120 },
      data: { label: template.label, nodeType: template.nodeType, agentName: template.agentName },
    };
    setNodes((nds) => [...nds, newNode]);
  }

  function deleteSelected() {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode && e.target !== selectedNode));
    setSelectedNode(null);
  }

  const inputStyle = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="flex h-full relative">
      {/* Edge description modal */}
      {pendingConnection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Explain this connection</h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Why does data flow from <code>{pendingConnection.source}</code> to <code>{pendingConnection.target}</code>?
              Agents will receive this context during execution.
            </p>
            <textarea
              value={edgeDescription}
              onChange={(e) => setEdgeDescription(e.target.value)}
              placeholder="e.g. Classified category is used to decide which extraction schema to apply..."
              rows={4}
              className="w-full px-3 py-2 rounded-md text-sm mb-3"
              style={inputStyle}
            />
            <div className="flex justify-end gap-2">
              <button onClick={cancelConnection} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                Cancel
              </button>
              <button onClick={confirmConnection} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
                Create Connection
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-52 p-3 overflow-y-auto" style={{ borderRight: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Built-in</p>
        {BUILTIN_TEMPLATES.map((t) => (
          <button key={t.label} onClick={() => addNode(t)} className="w-full text-left px-3 py-1.5 rounded-md text-xs mb-0.5" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            {t.label}
          </button>
        ))}

        {customAgents.length > 0 && (
          <>
            <p className="text-[10px] font-medium uppercase tracking-wider mt-4 mb-2" style={{ color: "var(--text-muted)" }}>My Agents</p>
            {customAgents.map((a) => (
              <button key={a.name} onClick={() => addNode({ nodeType: "agent", label: a.name, agentName: a.name })} className="w-full text-left px-3 py-1.5 rounded-md text-xs mb-0.5" style={{ color: "#3291ff", border: "1px solid var(--border)" }}>
                {a.name}
              </button>
            ))}
          </>
        )}

        <div className="mt-4 pt-3 space-y-1" style={{ borderTop: "1px solid var(--border)" }}>
          {selectedNode && (
            <button onClick={deleteSelected} className="w-full px-3 py-1.5 rounded-md text-xs" style={{ color: "#ee0000", border: "1px solid var(--border)" }}>Delete Selected</button>
          )}
          <button onClick={() => onSave?.(nodes, edges)} className="w-full px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>Save Workflow</button>
        </div>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNode(node.id)}
          onPaneClick={() => setSelectedNode(null)}
          nodeTypes={nodeTypes} fitView
          style={{ background: "#0a0a0f" }}
        >
          <Controls style={{ background: "#1c1c27", border: "1px solid #333", borderRadius: 8 }} />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#222" />
        </ReactFlow>
      </div>
    </div>
  );
}
