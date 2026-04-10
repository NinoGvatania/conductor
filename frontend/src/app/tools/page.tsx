"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Tool { id: string; name: string; description: string; url: string; method: string; connection_id: string | null; }
interface Connection { id: string; name: string; description: string; base_url: string; auth_type: string; has_credentials: boolean; }

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  useEffect(() => {
    api.listTools().then((t) => setTools(t as Tool[])).catch(console.error);
    api.listConnections().then((c) => setConnections(c as Connection[])).catch(console.error);
  }, []);

  async function deleteConnection(id: string) {
    if (!confirm("Delete this integration and all its tools?")) return;
    try {
      await api.deleteConnection(id);
      setConnections((p) => p.filter((c) => c.id !== id));
      setTools((p) => p.filter((t) => t.connection_id !== id));
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  // Group tools by connection
  const toolsByConnection: Record<string, Tool[]> = {};
  const orphanTools: Tool[] = [];
  for (const t of tools) {
    if (t.connection_id) {
      (toolsByConnection[t.connection_id] = toolsByConnection[t.connection_id] || []).push(t);
    } else {
      orphanTools.push(t);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Integrations</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Connect apps and APIs — tools grouped by integration</p>
        </div>
        <Link href="/tools/new" className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
          New Integration
        </Link>
      </div>

      {connections.length === 0 && orphanTools.length === 0 && (
        <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
          <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>No integrations yet</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Add Telegram, CRM, weather, or any API</p>
        </div>
      )}

      {/* Connections */}
      <div className="space-y-3">
        {connections.map((conn) => {
          const connTools = toolsByConnection[conn.id] || [];
          return (
            <div key={conn.id} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-card)", borderBottom: connTools.length > 0 ? "1px solid var(--border)" : "none" }}>
                <Link href={`/tools/connections/${conn.id}`} className="flex items-center gap-3 flex-1">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{conn.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                    background: conn.has_credentials ? "rgba(12,206,107,0.1)" : "rgba(245,158,11,0.1)",
                    color: conn.has_credentials ? "#0cce6b" : "#f59e0b",
                  }}>
                    {conn.has_credentials ? "Configured" : "No credentials"}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{connTools.length} tools</span>
                </Link>
                <div className="flex gap-2">
                  <Link href={`/tools/connections/${conn.id}`} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Edit</Link>
                  <button onClick={() => deleteConnection(conn.id)} className="text-[11px]" style={{ color: "#ee0000" }}>Delete</button>
                </div>
              </div>

              {connTools.map((t, i) => (
                <Link
                  key={t.id}
                  href={`/tools/${t.id}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderBottom: i < connTools.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono w-14 text-center" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{t.method}</span>
                  <span className="text-sm shrink-0" style={{ color: "var(--text-primary)" }}>{t.name}</span>
                  <span className="text-xs truncate" style={{ color: "#555" }}>{t.description}</span>
                </Link>
              ))}
            </div>
          );
        })}

        {/* Orphan tools */}
        {orphanTools.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Standalone Tools</span>
            </div>
            {orphanTools.map((t, i) => (
              <Link
                key={t.id}
                href={`/tools/${t.id}`}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: i < orphanTools.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <span className="text-[10px] px-2 py-0.5 rounded font-mono w-14 text-center" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{t.method}</span>
                <span className="text-sm shrink-0" style={{ color: "var(--text-primary)" }}>{t.name}</span>
                <span className="text-xs truncate" style={{ color: "#555" }}>{t.description}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
