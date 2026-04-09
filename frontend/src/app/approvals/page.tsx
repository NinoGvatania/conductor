"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface Approval {
  run_id: string;
  workflow_id: string;
  created_at: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [comment, setComment] = useState("");

  useEffect(() => {
    loadApprovals();
  }, []);

  async function loadApprovals() {
    try {
      const data = (await api.listApprovals()) as Approval[];
      setApprovals(data);
    } catch {
      // API not available
    }
  }

  async function handleResolve(runId: string, decision: string) {
    try {
      await api.resolveApproval(runId, decision, comment);
      setComment("");
      await loadApprovals();
    } catch {
      // handle error
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Pending Approvals
      </h2>

      {approvals.length === 0 ? (
        <p className="text-gray-500">No pending approvals</p>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <div
              key={approval.run_id}
              className="bg-white border border-gray-200 rounded-lg p-6"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-medium text-gray-900">
                    Run: {approval.run_id.slice(0, 8)}...
                  </p>
                  <p className="text-sm text-gray-500">
                    Workflow: {approval.workflow_id}
                  </p>
                  {approval.created_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(approval.created_at)}
                    </p>
                  )}
                </div>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                  Pending
                </span>
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment (optional)..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3"
                rows={2}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => handleResolve(approval.run_id, "approve")}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleResolve(approval.run_id, "reject")}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
