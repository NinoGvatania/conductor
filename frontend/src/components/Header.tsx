"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const initial = user?.email?.[0]?.toUpperCase() || "?";

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-9 w-48 rounded-lg py-1 shadow-xl z-50" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="px-3 py-2 text-xs truncate" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            {user?.email || "Not signed in"}
          </div>
          <button onClick={() => { signOut(); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs transition-colors" style={{ color: "var(--text-secondary)" }}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function TokenCounter() {
  const [tokens, setTokens] = useState(0);
  useEffect(() => {
    api.listRuns().then((runs) => {
      const total = (runs as Array<Record<string, unknown>>).reduce((s, r) => s + ((r.total_tokens as number) || 0), 0);
      setTokens(total);
    }).catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px]" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-muted)" }}>Tokens:</span>
      <span style={{ color: "var(--text-primary)" }}>{tokens.toLocaleString()}</span>
    </div>
  );
}

interface Project {
  id: string;
  name: string;
}

export default function Header() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    api.listProjects().then((p) => {
      const list = p as Project[];
      setProjects(list);
      if (list.length > 0 && !current) setCurrent(list[0].id);
    }).catch(() => {});
  }, [current]);

  async function handleCreate() {
    if (!newName.trim()) return;
    const p = (await api.createProject(newName)) as Project;
    setProjects((prev) => [p, ...prev]);
    setCurrent(p.id);
    setNewName("");
    setShowDropdown(false);
  }

  const currentProject = projects.find((p) => p.id === current);

  return (
    <header className="h-12 flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-50" style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>AgentFlow</span>
        <span style={{ color: "var(--border)" }}>/</span>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            {currentProject?.name || "Select Project"}
            <span className="text-[10px]">▼</span>
          </button>
          {showDropdown && (
            <div className="absolute top-8 left-0 w-56 rounded-lg py-1 shadow-xl z-50" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setCurrent(p.id); setShowDropdown(false); }}
                  className="w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{ color: current === p.id ? "var(--text-primary)" : "var(--text-secondary)", background: current === p.id ? "var(--bg-hover)" : "transparent" }}
                >
                  {p.name}
                </button>
              ))}
              <div className="px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex gap-1">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    placeholder="New project..."
                    className="flex-1 px-2 py-1 rounded text-xs"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                  <button onClick={handleCreate} className="px-2 py-1 rounded text-xs" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>+</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <TokenCounter />
        <UserMenu />
      </div>
    </header>
  );
}
