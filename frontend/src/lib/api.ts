const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  // Chat
  chat: (message: string) =>
    request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  // Workflows
  listWorkflows: () => request("/api/workflows"),
  createWorkflow: (workflow: Record<string, unknown>) =>
    request("/api/workflows", {
      method: "POST",
      body: JSON.stringify(workflow),
    }),
  startRun: (workflowId: string) =>
    request(`/api/workflows/${workflowId}/run`, { method: "POST" }),

  // Runs
  listRuns: (status?: string) =>
    request(`/api/runs${status ? `?status=${status}` : ""}`),
  getRun: (runId: string) => request(`/api/runs/${runId}`),

  // Approvals
  listApprovals: () => request("/api/approvals"),
  resolveApproval: (runId: string, decision: string, comment: string = "") =>
    request(`/api/approvals/${runId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    }),

  // Agents
  listAgents: () => request("/api/agents"),
  getAgent: (name: string) => request(`/api/agents/${name}`),
};
