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
  // Projects
  listProjects: () => request("/api/projects"),
  createProject: (name: string, description = "") =>
    request("/api/projects", { method: "POST", body: JSON.stringify({ name, description }) }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: "DELETE" }),

  // Conversations
  listConversations: (projectId?: string) =>
    request(`/api/conversations${projectId ? `?project_id=${projectId}` : ""}`),
  getMessages: (convId: string) => request(`/api/conversations/${convId}/messages`),
  sendMessage: (content: string, conversationId?: string, projectId?: string) =>
    request("/api/conversations/send", {
      method: "POST",
      body: JSON.stringify({ content, conversation_id: conversationId, project_id: projectId }),
    }),
  deleteConversation: (id: string) => request(`/api/conversations/${id}`, { method: "DELETE" }),

  // Agents
  listAgents: () => request("/api/agents"),
  getAgent: (id: string) => request(`/api/agents/${id}`),
  createAgent: (agent: Record<string, unknown>) =>
    request("/api/agents", { method: "POST", body: JSON.stringify(agent) }),
  updateAgent: (id: string, data: Record<string, unknown>) =>
    request(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAgent: (id: string) => request(`/api/agents/${id}`, { method: "DELETE" }),
  cloneAgent: (id: string) => request(`/api/agents/${id}/clone`, { method: "POST" }),

  // Tools
  listTools: (projectId?: string) =>
    request(`/api/tools${projectId ? `?project_id=${projectId}` : ""}`),
  createTool: (tool: Record<string, unknown>) =>
    request("/api/tools", { method: "POST", body: JSON.stringify(tool) }),
  updateTool: (id: string, data: Record<string, unknown>) =>
    request(`/api/tools/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTool: (id: string) => request(`/api/tools/${id}`, { method: "DELETE" }),

  // Workflows
  listWorkflows: () => request("/api/workflows"),
  getWorkflow: (id: string) => request(`/api/workflows/${id}`),
  createWorkflow: (workflow: Record<string, unknown>) =>
    request("/api/workflows", { method: "POST", body: JSON.stringify(workflow) }),
  updateWorkflow: (id: string, workflow: Record<string, unknown>) =>
    request(`/api/workflows/${id}`, { method: "PUT", body: JSON.stringify(workflow) }),
  deleteWorkflow: (id: string) =>
    request(`/api/workflows/${id}`, { method: "DELETE" }),
  startRun: (workflowId: string) =>
    request(`/api/workflows/${workflowId}/run`, { method: "POST" }),

  // Runs
  listRuns: (status?: string) => request(`/api/runs${status ? `?status=${status}` : ""}`),
  getRun: (runId: string) => request(`/api/runs/${runId}`),
  getTokenStats: () => request("/api/runs/stats"),

  // LLM Providers
  getProviderCatalog: () => request("/api/llm-providers/catalog"),
  listConnectedProviders: (projectId?: string) =>
    request(`/api/llm-providers${projectId ? `?project_id=${projectId}` : ""}`),
  connectProvider: (provider: string, apiKey: string, baseUrl = "", projectId?: string) =>
    request("/api/llm-providers/connect", {
      method: "POST",
      body: JSON.stringify({ provider, api_key: apiKey, base_url: baseUrl, project_id: projectId }),
    }),
  disconnectProvider: (id: string) =>
    request(`/api/llm-providers/${id}/disconnect`, { method: "POST" }),

  // Legacy
  chat: (message: string) =>
    request("/api/chat", { method: "POST", body: JSON.stringify({ message }) }),
  listApprovals: () => request("/api/approvals"),
  resolveApproval: (runId: string, decision: string, comment = "") =>
    request(`/api/approvals/${runId}/resolve`, { method: "POST", body: JSON.stringify({ decision, comment }) }),
  listProviders: () => request("/api/agents/providers"),
};
