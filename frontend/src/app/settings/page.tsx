"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface ProviderInfo { id: string; name: string; description: string; models: Array<{ id: string; name: string; tier: string }>; auth_type: string; auth_placeholder: string; }
interface ConnectedProvider { id: string; provider: string; is_active: boolean; }
interface Member { id: string; email: string; role: string; invited_at: string; accepted: boolean; }
interface Project { id: string; name: string; }

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"providers" | "team" | "profile">("providers");
  const [catalog, setCatalog] = useState<ProviderInfo[]>([]);
  const [connected, setConnected] = useState<ConnectedProvider[]>([]);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Team
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  useEffect(() => {
    api.getProviderCatalog().then((c) => setCatalog(c as ProviderInfo[])).catch(console.error);
    api.listConnectedProviders().then((c) => setConnected(c as ConnectedProvider[])).catch(console.error);
    api.listProjects().then((p) => {
      const list = p as Project[];
      setProjects(list);
      if (list.length > 0) setSelectedProject(list[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedProject) {
      api.listMembers(selectedProject).then((m) => setMembers(m as Member[])).catch(console.error);
    }
  }, [selectedProject]);

  function isConnected(providerId: string): boolean {
    return connected.some((c) => c.provider === providerId && c.is_active);
  }

  async function handleConnect(providerId: string) {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await api.connectProvider(providerId, apiKey, baseUrl);
      api.listConnectedProviders().then((c) => setConnected(c as ConnectedProvider[]));
      setApiKey("");
      setBaseUrl("");
      setExpandedProvider(null);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDisconnect(providerId: string) {
    const conn = connected.find((c) => c.provider === providerId);
    if (conn) {
      await api.disconnectProvider(conn.id);
      setConnected((prev) => prev.map((c) => c.id === conn.id ? { ...c, is_active: false } : c));
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !selectedProject) return;
    try {
      await api.inviteMember(selectedProject, inviteEmail, inviteRole);
      setInviteEmail("");
      api.listMembers(selectedProject).then((m) => setMembers(m as Member[]));
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Remove this member?")) return;
    await api.removeMember(selectedProject, memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-0.5 rounded-md w-fit" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {(["providers", "team", "profile"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-3 py-1 rounded text-xs font-medium capitalize" style={{ background: tab === t ? "rgba(255,255,255,0.06)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-muted)" }}>
            {t === "providers" ? "LLM Providers" : t === "team" ? "Team" : "Profile"}
          </button>
        ))}
      </div>

      {/* Providers Tab */}
      {tab === "providers" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {catalog.map((p) => {
            const active = isConnected(p.id);
            const expanded = expandedProvider === p.id;
            return (
              <div key={p.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${active ? "#0cce6b44" : "var(--border)"}`, background: "var(--bg-card)" }}>
                <button onClick={() => setExpandedProvider(expanded ? null : p.id)} className="w-full text-left p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                      background: active ? "rgba(12,206,107,0.1)" : "transparent",
                      color: active ? "#0cce6b" : "#555",
                    }}>
                      {active ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "#666" }}>{p.description}</p>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                    <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={p.auth_placeholder} type="password" className="w-full px-3 py-2 rounded-md text-sm mb-2" style={s} />
                    {p.auth_type === "api_key_and_url" && (
                      <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-api.com/v1" className="w-full px-3 py-2 rounded-md text-sm mb-2" style={s} />
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => handleConnect(p.id)} disabled={saving || !apiKey.trim()} className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
                        {saving ? "..." : "Connect"}
                      </button>
                      {active && (
                        <button onClick={() => handleDisconnect(p.id)} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "#ee0000", border: "1px solid var(--border)" }}>Disconnect</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Team Tab */}
      {tab === "team" && (
        <div>
          {/* Project selector */}
          {projects.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs mb-1" style={{ color: "#666" }}>Project</label>
              <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className="px-3 py-2 rounded-md text-sm" style={s}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Invite */}
          <div className="rounded-lg p-4 mb-4" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <div className="text-xs font-medium mb-3" style={{ color: "var(--text-primary)" }}>Invite Member</div>
            <div className="flex gap-2">
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@example.com" className="flex-1 px-3 py-2 rounded-md text-sm" style={s} />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="px-3 py-2 rounded-md text-sm" style={s}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button onClick={handleInvite} disabled={!inviteEmail.trim()} className="px-3 py-2 rounded-md text-xs font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>Invite</button>
            </div>
          </div>

          {/* Members list */}
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--bg-card)" }}>
                  {["Email", "Role", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider" style={{ color: "#555", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--text-primary)" }}>{m.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: m.role === "admin" ? "#f59e0b" : m.role === "viewer" ? "#666" : "var(--text-secondary)" }}>
                        {m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: m.accepted ? "#0cce6b" : "#666" }}>
                      {m.accepted ? "Active" : "Pending"}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleRemoveMember(m.id)} className="text-[11px]" style={{ color: "#ee0000" }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {members.length === 0 && (
              <div className="py-8 text-center text-xs" style={{ color: "#555" }}>No team members yet</div>
            )}
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {tab === "profile" && (
        <div className="rounded-lg p-6" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: "#666" }}>Email</label>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>{user?.email || "Not signed in"}</p>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "#666" }}>User ID</label>
              <p className="text-xs font-mono" style={{ color: "#555" }}>{user?.id || "—"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
