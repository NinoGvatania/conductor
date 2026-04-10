"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Workflow { id: string; name: string; version: string; created_at: string; }

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tab, setTab] = useState<"my" | "library">("my");

  useEffect(() => {
    api.listWorkflows().then((w) => setWorkflows(w as Workflow[])).catch(() => {});
  }, []);

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
            <Link href="/workflows/editor" className="text-xs" style={{ color: "var(--accent-light, #3291ff)" }}>Create your first workflow →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workflows.map((w) => (
              <div key={w.id} className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>{w.name || "Unnamed"}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>v{w.version || "1.0.0"} · {w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}</div>
              </div>
            ))}
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
