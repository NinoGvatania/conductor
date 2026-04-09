"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Tool { id: string; name: string; description: string; url: string; method: string; is_public: boolean; }

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    api.listTools().then((t) => setTools(t as Tool[])).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Tools</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>API integrations your agents can use</p>
        </div>
        <Link href="/tools/new" className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
          Create Tool
        </Link>
      </div>

      {tools.length === 0 ? (
        <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
          <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>No tools yet</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Create API integrations for Telegram, CRM, email, etc.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tools.map((t) => (
            <div key={t.id} className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{t.method}</span>
              </div>
              <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{t.description || "No description"}</p>
              <p className="text-[10px] truncate font-mono" style={{ color: "var(--text-muted)" }}>{t.url || "No URL"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
