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

const TRIGGER_TEMPLATES = [
  { nodeType: "trigger", label: "Telegram Bot", agentName: null, triggerType: "telegram" },
  { nodeType: "trigger", label: "Webhook", agentName: null, triggerType: "webhook" },
  { nodeType: "trigger", label: "Manual Input", agentName: null, triggerType: "manual" },
];

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

  // Modal for edge description — either creating a new edge (pendingConnection)
  // or editing the description of an existing one (editingEdge).
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null);
  const [edgeDescription, setEdgeDescription] = useState("");

  // Agent library modal (replaces the old permanent left sidebar)
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");

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

  // Click an existing edge -> open the edit modal prefilled with its description
  const onEdgeClick = useCallback((_: unknown, edge: Edge) => {
    setEditingEdge(edge);
    const desc = (edge.data as Record<string, unknown> | undefined)?.description;
    setEdgeDescription(typeof desc === "string" ? desc : "");
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

  function saveEditedEdge() {
    if (!editingEdge) return;
    setEdges((eds) =>
      eds.map((e) =>
        e.id === editingEdge.id
          ? {
              ...e,
              label: edgeDescription || undefined,
              data: { ...(e.data || {}), description: edgeDescription },
            }
          : e,
      ),
    );
    setEditingEdge(null);
    setEdgeDescription("");
  }

  function deleteEditedEdge() {
    if (!editingEdge) return;
    setEdges((eds) => eds.filter((e) => e.id !== editingEdge.id));
    setEditingEdge(null);
    setEdgeDescription("");
  }

  function cancelEditEdge() {
    setEditingEdge(null);
    setEdgeDescription("");
  }

  function addNode(template: { nodeType: string; label: string; agentName: string | null; triggerType?: string }) {
    const id = `node_${Date.now()}`;
    const newNode: Node = {
      id, type: "custom",
      position: { x: 250 + Math.random() * 200, y: template.nodeType === "trigger" ? 30 : 100 + nodes.length * 120 },
      data: {
        label: template.label,
        nodeType: template.nodeType,
        agentName: template.agentName,
        triggerType: template.triggerType || undefined,
      },
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
      {/* Edge description modal — create */}
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

      {/* Edge description modal — edit existing */}
      {editingEdge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Edit connection</h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              <code>{editingEdge.source}</code> → <code>{editingEdge.target}</code>. Describe why the data flows here — this context is passed to downstream agents.
            </p>
            <textarea
              value={edgeDescription}
              onChange={(e) => setEdgeDescription(e.target.value)}
              placeholder="e.g. Classified category is used to decide which extraction schema to apply..."
              rows={4}
              className="w-full px-3 py-2 rounded-md text-sm mb-3"
              style={inputStyle}
            />
            <div className="flex justify-between gap-2">
              <button onClick={deleteEditedEdge} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "#ee4444", border: "1px solid var(--border)" }}>
                Delete connection
              </button>
              <div className="flex gap-2">
                <button onClick={cancelEditEdge} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  Cancel
                </button>
                <button onClick={saveEditedEdge} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent library modal — opened from the floating toolbar */}
      {libraryOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setLibraryOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] rounded-lg flex flex-col"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Agent library
              </h3>
              <button
                onClick={() => setLibraryOpen(false)}
                className="text-lg leading-none px-1"
                style={{ color: "var(--text-muted)" }}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <input
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search agents..."
                className="w-full px-3 py-2 rounded-md text-sm"
                style={inputStyle}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {(() => {
                const q = librarySearch.toLowerCase().trim();
                const matches = (label: string, extra = "") =>
                  !q ||
                  label.toLowerCase().includes(q) ||
                  extra.toLowerCase().includes(q);

                const filteredTriggers = TRIGGER_TEMPLATES.filter((t) =>
                  matches(t.label, t.triggerType),
                );
                const filteredBuiltin = BUILTIN_TEMPLATES.filter((t) =>
                  matches(t.label, t.agentName || t.nodeType),
                );
                const filteredCustom = customAgents.filter((a) => matches(a.name, a.description));

                const triggerIcons: Record<string, string> = { telegram: "✈️", webhook: "🔗", manual: "▶️" };

                return (
                  <>
                    {filteredTriggers.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                          Triggers — entry point
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {filteredTriggers.map((t) => (
                            <button
                              key={t.label}
                              onClick={() => {
                                addNode(t);
                                setLibraryOpen(false);
                                setLibrarySearch("");
                              }}
                              className="text-left px-3 py-2 rounded-md text-xs"
                              style={{
                                color: "#f97316",
                                background: "var(--bg-secondary)",
                                border: "1px solid #f9731640",
                              }}
                            >
                              <div className="flex items-center gap-1.5">
                                <span>{triggerIcons[t.triggerType] || "⚡"}</span>
                                <span className="font-medium">{t.label}</span>
                              </div>
                              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {t.triggerType === "telegram" ? "Bot messages" : t.triggerType === "webhook" ? "External POST" : "Run with input"}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {filteredBuiltin.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                          Built-in
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {filteredBuiltin.map((t) => (
                            <button
                              key={t.label}
                              onClick={() => {
                                addNode(t);
                                setLibraryOpen(false);
                                setLibrarySearch("");
                              }}
                              className="text-left px-3 py-2 rounded-md text-xs"
                              style={{
                                color: "var(--text-secondary)",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              <div className="font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</div>
                              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {t.nodeType}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {filteredCustom.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                          My Agents
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {filteredCustom.map((a) => (
                            <button
                              key={a.name}
                              onClick={() => {
                                addNode({ nodeType: "agent", label: a.name, agentName: a.name });
                                setLibraryOpen(false);
                                setLibrarySearch("");
                              }}
                              className="text-left px-3 py-2 rounded-md text-xs"
                              style={{
                                color: "#3291ff",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              <div className="font-medium">{a.name}</div>
                              {a.description && (
                                <div className="text-[10px] mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>
                                  {a.description}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {filteredTriggers.length === 0 && filteredBuiltin.length === 0 && filteredCustom.length === 0 && (
                      <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>
                        No agents match your search
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Full-width canvas + floating toolbar */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onNodeClick={(_, node) => setSelectedNode(node.id)}
          onPaneClick={() => setSelectedNode(null)}
          nodeTypes={nodeTypes} fitView
          style={{ background: "#0a0a0f" }}
        >
          <Controls style={{ background: "#1c1c27", border: "1px solid #333", borderRadius: 8 }} />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#222" />
        </ReactFlow>

        {/* Floating bottom-left toolbar — Zapier-style */}
        <div
          className="absolute bottom-4 left-4 flex gap-2 items-center px-2 py-2 rounded-lg z-10"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <button
            onClick={() => setLibraryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
            style={{ color: "var(--text-primary)", background: "var(--bg-hover)" }}
          >
            <span className="text-sm">📚</span> Library
          </button>
          {selectedNode && (
            <button
              onClick={deleteSelected}
              className="px-3 py-1.5 rounded-md text-xs"
              style={{ color: "#ee4444", border: "1px solid var(--border)" }}
            >
              Delete node
            </button>
          )}
          <div className="w-px h-5" style={{ background: "var(--border)" }} />
          <button
            onClick={() => onSave?.(nodes, edges)}
            className="px-3 py-1.5 rounded-md text-xs font-medium"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
          >
            Save Workflow
          </button>
        </div>
      </div>
    </div>
  );
}
