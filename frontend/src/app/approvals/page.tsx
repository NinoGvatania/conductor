"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Approval {
  run_id: string;
  workflow_id: string;
  created_at: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [comment, setComment] = useState("");

  useEffect(() => { loadApprovals(); }, []);

  async function loadApprovals() {
    try { setApprovals((await api.listApprovals()) as Approval[]); } catch {}
  }

  async function handleResolve(runId: string, decision: string) {
    try { await api.resolveApproval(runId, decision, comment); setComment(""); await loadApprovals(); } catch {}
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Approvals</h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Review and approve paused workflow steps</p>

      {approvals.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-muted)" }}>No pending approvals</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((a) => (
            <div key={a.run_id} className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>Run: {a.run_id.slice(0, 8)}...</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Workflow: {a.workflow_id}</p>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}>Pending</span>
              </div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..." rows={2} className="w-full px-3 py-2 rounded-lg text-sm mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              <div className="flex gap-2">
                <button onClick={() => handleResolve(a.run_id, "approve")} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--success)" }}>Approve</button>
                <button onClick={() => handleResolve(a.run_id, "reject")} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--error)" }}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
