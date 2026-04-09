"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Workflow { id: string; name: string; version: string; created_at: string; }

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  useEffect(() => {
    api.listWorkflows().then((w) => setWorkflows(w as Workflow[])).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Workflows</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Visual workflow editor coming soon. Existing workflows listed below.</p>
        </div>
      </div>

      {workflows.length === 0 ? (
        <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
          <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>No workflows yet</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Generate workflows from Chat or build them visually</p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--bg-card)" }}>
                {["Name", "Version", "Created"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--text-primary)" }}>{w.name || w.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{w.version || "1.0.0"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
