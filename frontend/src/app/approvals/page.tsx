"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Approval { run_id: string; workflow_id: string; created_at: string; }

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [comment, setComment] = useState("");

  useEffect(() => { load(); }, []);
  async function load() { try { setApprovals((await api.listApprovals()) as Approval[]); } catch {} }
  async function resolve(runId: string, decision: string) {
    try { await api.resolveApproval(runId, decision, comment); setComment(""); await load(); } catch {}
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Approvals</h1>
      {approvals.length === 0 ? (
        <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No pending approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <div key={a.run_id} className="rounded-lg p-4" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{a.run_id.slice(0, 8)}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{a.workflow_id}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(245,166,35,0.1)", color: "var(--warning)" }}>pending</span>
              </div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" rows={2} className="w-full px-3 py-2 rounded-md text-sm mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              <div className="flex gap-2">
                <button onClick={() => resolve(a.run_id, "approve")} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--success)", color: "#000" }}>Approve</button>
                <button onClick={() => resolve(a.run_id, "reject")} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--error)", color: "#fff" }}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
