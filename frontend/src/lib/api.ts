import { getToken, clearAuth } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  // Auth
  register: (email: string, password: string, name: string) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/api/auth/me"),

  // Projects
  listProjects: () => request("/api/projects"),
  createProject: (name: string, description = "") =>
    request("/api/projects", { method: "POST", body: JSON.stringify({ name, description }) }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: "DELETE" }),

  // Conversations
  listConversations: (projectId?: string) =>
    request(`/api/conversations${projectId ? `?project_id=${projectId}` : ""}`),
  getMessages: (convId: string) => request(`/api/conversations/${convId}/messages`),
  sendMessage: (content: string, conversationId?: string, projectId?: string, model?: string) =>
    request("/api/conversations/send", {
      method: "POST",
      body: JSON.stringify({ content, conversation_id: conversationId, project_id: projectId, model }),
    }),
  deleteConversation: (id: string) => request(`/api/conversations/${id}`, { method: "DELETE" }),

  // Builder chats (agent/workflow creation)
  listBuilderConversations: (contextType?: string, contextId?: string) => {
    const params = new URLSearchParams();
    if (contextType) params.set("context_type", contextType);
    if (contextId) params.set("context_id", contextId);
    const qs = params.toString();
    return request(`/api/builders/conversations${qs ? "?" + qs : ""}`);
  },
  getBuilderMessages: (convId: string) => request(`/api/builders/conversations/${convId}/messages`),
  sendBuilderMessage: (
    content: string,
    contextType: string,
    contextId?: string,
    conversationId?: string,
    model?: string,
  ) =>
    request("/api/builders/send", {
      method: "POST",
      body: JSON.stringify({
        content,
        context_type: contextType,
        context_id: contextId,
        conversation_id: conversationId,
        model: model || null,
      }),
    }),

  // Agents
  listAgents: (projectId?: string) =>
    request(`/api/agents${projectId ? `?project_id=${projectId}` : ""}`),
  getAgent: (id: string) => request(`/api/agents/${id}`),
  createAgent: (agent: Record<string, unknown>) =>
    request("/api/agents", { method: "POST", body: JSON.stringify(agent) }),
  updateAgent: (id: string, data: Record<string, unknown>) =>
    request(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAgent: (id: string) => request(`/api/agents/${id}`, { method: "DELETE" }),
  cloneAgent: (id: string) => request(`/api/agents/${id}/clone`, { method: "POST" }),
  listProviders: () => request("/api/agents/providers"),

  // Tools
  listTools: (projectId?: string) =>
    request(`/api/tools${projectId ? `?project_id=${projectId}` : ""}`),
  getTool: (id: string) => request(`/api/tools/${id}`),
  createTool: (tool: Record<string, unknown>) =>
    request("/api/tools", { method: "POST", body: JSON.stringify(tool) }),
  updateTool: (id: string, data: Record<string, unknown>) =>
    request(`/api/tools/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTool: (id: string) => request(`/api/tools/${id}`, { method: "DELETE" }),
  generateToolsFromDocs: (apiDocs: string, description = "") =>
    request("/api/tools/wizard", { method: "POST", body: JSON.stringify({ api_docs: apiDocs, description }) }),

  // Connections
  listConnections: (projectId?: string) =>
    request(`/api/connections${projectId ? `?project_id=${projectId}` : ""}`),
  getConnection: (id: string) => request(`/api/connections/${id}`),
  createConnection: (conn: Record<string, unknown>) =>
    request("/api/connections", { method: "POST", body: JSON.stringify(conn) }),
  updateConnection: (id: string, data: Record<string, unknown>) =>
    request(`/api/connections/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteConnection: (id: string) =>
    request(`/api/connections/${id}`, { method: "DELETE" }),
  getConnectionTools: (id: string) => request(`/api/connections/${id}/tools`),

  // Workflows
  listWorkflows: (projectId?: string) =>
    request(`/api/workflows${projectId ? `?project_id=${projectId}` : ""}`),
  getWorkflowLibrary: () => request("/api/workflows/library"),
  getWorkflow: (id: string) => request(`/api/workflows/${id}`),
  createWorkflow: (workflow: Record<string, unknown>, projectId?: string) =>
    request(`/api/workflows${projectId ? `?project_id=${projectId}` : ""}`, { method: "POST", body: JSON.stringify(workflow) }),
  updateWorkflow: (id: string, workflow: Record<string, unknown>) =>
    request(`/api/workflows/${id}`, { method: "PUT", body: JSON.stringify(workflow) }),
  deleteWorkflow: (id: string) =>
    request(`/api/workflows/${id}`, { method: "DELETE" }),
  startRun: (workflowId: string) =>
    request(`/api/workflows/${workflowId}/run`, { method: "POST" }),

  // Runs
  listRuns: (status?: string, projectId?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (projectId) params.set("project_id", projectId);
    const qs = params.toString();
    return request(`/api/runs${qs ? `?${qs}` : ""}`);
  },
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
  getProviderModels: (provider: string) =>
    request(`/api/llm-providers/${provider}/models`),

  // Workflow Triggers
  listTriggers: (workflowId: string) =>
    request(`/api/workflows/${workflowId}/triggers`),
  createTrigger: (workflowId: string, data: Record<string, unknown>) =>
    request(`/api/workflows/${workflowId}/triggers`, { method: "POST", body: JSON.stringify(data) }),
  updateTrigger: (triggerId: string, data: Record<string, unknown>) =>
    request(`/api/triggers/${triggerId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTrigger: (triggerId: string) =>
    request(`/api/triggers/${triggerId}`, { method: "DELETE" }),

  // Knowledge Bases
  listKnowledgeBases: (projectId?: string) =>
    request(`/api/knowledge-bases${projectId ? `?project_id=${projectId}` : ""}`),
  getKnowledgeBase: (id: string) => request(`/api/knowledge-bases/${id}`),
  createKnowledgeBase: (name: string, description = "", projectId?: string) =>
    request("/api/knowledge-bases", {
      method: "POST",
      body: JSON.stringify({ name, description, project_id: projectId }),
    }),
  updateKnowledgeBase: (id: string, data: Record<string, unknown>) =>
    request(`/api/knowledge-bases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteKnowledgeBase: (id: string) =>
    request(`/api/knowledge-bases/${id}`, { method: "DELETE" }),
  uploadKnowledgeBaseFile: async (kbId: string, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/knowledge-bases/${kbId}/upload`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },
  removeKnowledgeBaseFile: (kbId: string, filename: string) =>
    request(`/api/knowledge-bases/${kbId}/files/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    }),

  // Files
  uploadFile: async (file: File, agentId = "") => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("agent_id", agentId);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/files/upload`, { method: "POST", headers, body: formData });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  // Project members
  listMembers: (projectId: string) => request(`/api/projects/${projectId}/members`),
  inviteMember: (projectId: string, email: string, role: string) =>
    request(`/api/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ email, role }) }),
  removeMember: (projectId: string, memberId: string) =>
    request(`/api/projects/${projectId}/members/${memberId}`, { method: "DELETE" }),
};
