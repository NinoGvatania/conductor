"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Tool { id: string; name: string; description: string; url: string; method: string; }
interface ToolPickerProps {
  onSelect: (tools: Tool[]) => void;
  selectedNames: string[];
  onClose: () => void;
}

export default function ToolPicker({ onSelect, selectedNames, onClose }: ToolPickerProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedNames));
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.listTools().then((t) => setTools(t as Tool[])).catch(console.error);
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    const picked = tools.filter((t) => selected.has(t.id));
    onSelect(picked);
    onClose();
  }

  const filtered = tools.filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-lg rounded-lg overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Select Tools</span>
          <button onClick={onClose} className="text-xs" style={{ color: "var(--text-muted)" }}>Close</button>
        </div>

        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools..." className="w-full px-3 py-1.5 rounded-md text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-xs" style={{ color: "var(--text-muted)" }}>
              {tools.length === 0 ? "No tools created yet. Create one in Tools page." : "No match"}
            </p>
          ) : filtered.map((t) => (
            <button key={t.id} onClick={() => toggle(t.id)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md mb-0.5 transition-colors" style={{ background: selected.has(t.id) ? "var(--bg-hover)" : "transparent" }}>
              <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0" style={{ borderColor: selected.has(t.id) ? "#0cce6b" : "var(--border)", background: selected.has(t.id) ? "#0cce6b" : "transparent" }}>
                {selected.has(t.id) && <span className="text-[10px] text-black">✓</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>{t.method}</span>
                </div>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{t.description || t.url}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{selected.size} selected</span>
          <div className="flex gap-2">
            <a href="/tools/new" target="_blank" className="text-xs px-3 py-1.5 rounded-md" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Create New Tool</a>
            <button onClick={handleConfirm} className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>Add Selected</button>
          </div>
        </div>
      </div>
    </div>
  );
}
