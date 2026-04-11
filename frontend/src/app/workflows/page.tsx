"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import BuilderChat from "@/components/BuilderChat";

interface Workflow { id: string; name: string; version: string; created_at: string; }
interface Template { id: string; name: string; description: string; tags: string[]; definition: Record<string, unknown>; }

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tab, setTab] = useState<"my" | "library">("my");

  async function refreshWorkflows() {
    try {
      const w = await api.listWorkflows();
      setWorkflows(w as Workflow[]);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    refreshWorkflows();
    api.getWorkflowLibrary().then((t) => setTemplates(t as Template[])).catch((e) => console.error(e));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this workflow?")) return;
    try { await api.deleteWorkflow(id); setWorkflows((p) => p.filter((w) => w.id !== id)); } catch {}
  }

  async function handleRun(id: string) {
    try { await api.startRun(id); alert("Run started!"); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleUseTemplate(template: Template) {
    try {
      const result = (await api.createWorkflow(template.definition)) as { id: string };
      setWorkflows((prev) => [{ id: result.id, name: template.name, version: "1.0.0", created_at: new Date().toISOString() }, ...prev]);
      setTab("my");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="flex gap-6 -mr-6">
      <div className="flex-1 min-w-0">
      <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Workflows</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Build and manage automated processes</p>
        </div>
        <Link href="/workflows/editor" className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
          New Workflow
        </Link>
      </div>

      <div className="flex gap-1 mb-6 p-0.5 rounded-md w-fit" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {(["my", "library"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-3 py-1 rounded text-xs font-medium" style={{ background: tab === t ? "var(--bg-hover)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-muted)" }}>
            {t === "my" ? `My Workflows (${workflows.length})` : `Library (${templates.length})`}
          </button>
        ))}
      </div>

      {tab === "my" && (
        workflows.length === 0 ? (
          <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>No workflows yet</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              <Link href="/workflows/editor" style={{ color: "#3291ff" }}>Create from scratch</Link> or use a template from the <button onClick={() => setTab("library")} style={{ color: "#3291ff" }}>Library</button>
            </p>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--bg-card)" }}>
                  {["Name", "Version", "Created", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{w.name || "Unnamed"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>v{w.version || "1.0.0"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => handleRun(w.id)} className="text-[11px] px-2 py-0.5 rounded" style={{ color: "#0cce6b", border: "1px solid var(--border)" }}>Run</button>
                        <Link href={`/workflows/editor?id=${w.id}`} className="text-[11px] px-2 py-0.5 rounded" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Edit</Link>
                        <button onClick={() => handleDelete(w.id)} className="text-[11px] px-2 py-0.5 rounded" style={{ color: "#ee0000", border: "1px solid var(--border)" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "library" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.name}</h3>
                <button onClick={() => handleUseTemplate(t)} className="text-[11px] px-2 py-0.5 rounded shrink-0" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
                  Use
                </button>
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{t.description}</p>
              <div className="flex gap-1 flex-wrap">
                {t.tags.map((tag) => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
      </div>
      <aside
        className="w-80 shrink-0 sticky top-12 hidden lg:block -my-6 self-start h-[calc(100vh-48px)]"
        style={{ borderLeft: "1px solid var(--border)" }}
      >
        <BuilderChat
          contextType="workflow_builder"
          title="Design Workflow with AI"
          placeholder="Describe your process..."
          onEntityCreated={(entity) => {
            if (entity.type === "workflow") refreshWorkflows();
          }}
        />
      </aside>
    </div>
  );
}
