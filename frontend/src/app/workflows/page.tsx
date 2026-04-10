"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Workflow { id: string; name: string; version: string; created_at: string; }

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tab, setTab] = useState<"my" | "library">("my");

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    try { setWorkflows((await api.listWorkflows()) as Workflow[]); } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this workflow?")) return;
    try {
      await api.deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleRun(id: string) {
    try {
      await api.startRun(id);
      alert("Run started! Check Dashboard for results.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to start run");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Workflows</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Build and manage automated processes</p>
        </div>
        <Link href="/workflows/editor" className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
          New Workflow
        </Link>
      </div>

      <div className="flex gap-1 mb-4 p-0.5 rounded-md w-fit" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {(["my", "library"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-3 py-1 rounded text-xs font-medium capitalize" style={{ background: tab === t ? "var(--bg-hover)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-muted)" }}>
            {t === "my" ? "My Workflows" : "Library"}
          </button>
        ))}
      </div>

      {tab === "my" && (
        workflows.length === 0 ? (
          <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>No workflows yet</p>
            <Link href="/workflows/editor" className="text-xs" style={{ color: "#3291ff" }}>Create your first workflow →</Link>
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
        <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
          <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>Workflow library coming soon</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Pre-built workflows for common business processes</p>
        </div>
      )}
    </div>
  );
}
