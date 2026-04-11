"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Tool {
  id: string;
  name: string;
  description: string;
  url: string;
  method: string;
}

interface ToolPickerProps {
  /** Names of integrations already attached to the agent (for toggle state) */
  selectedNames: string[];
  /** Called when the user closes the picker. Receives the full set of picked
   *  integrations (already-attached + newly-picked, minus un-toggled ones) so
   *  the parent can overwrite the agent's integrations array in one shot. */
  onConfirm: (picked: Tool[]) => void;
  onClose: () => void;
}

/**
 * Claude-style "Directory" modal for picking integrations from the user's
 * library. Lists tools from /api/tools as clickable cards. Clicking a card
 * toggles its selection; closing applies the new selection in bulk.
 *
 * Intentionally does NOT let the user create a new integration inline — we
 * want the Integrations tab to be the single place where integrations are
 * defined, so attach-only here with a prominent link to /tools.
 */
export default function ToolPicker({ selectedNames, onConfirm, onClose }: ToolPickerProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedNames));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTools()
      .then((t) => setTools(t as Tool[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function toggle(tool: Tool) {
    setSelected((prev) => {
      const next = new Set(prev);
      // Toggle by name — the agent stores attachments by name, and selectedNames
      // comes in as names, so the set is keyed by name too.
      if (next.has(tool.name)) next.delete(tool.name);
      else next.add(tool.name);
      return next;
    });
  }

  function handleDone() {
    const picked = tools.filter((t) => selected.has(t.name));
    onConfirm(picked);
    onClose();
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return tools;
    return tools.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q),
    );
  }, [tools, search]);

  // Icon helper: use the first letter of the tool name on a colored square
  function iconFor(name: string): { letter: string; bg: string } {
    const letter = (name[0] || "?").toUpperCase();
    // Deterministic color from the name's char code, picked from a small palette
    const palette = ["#6366f1", "#0cce6b", "#f5a623", "#ec4899", "#3291ff", "#a855f7"];
    const idx = (name.charCodeAt(0) || 0) % palette.length;
    return { letter, bg: palette[idx] };
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] rounded-lg flex flex-col"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Integrations
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Подключи интеграции из своей библиотеки к этому агенту
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xl leading-none px-2"
            style={{ color: "var(--text-muted)" }}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations..."
            className="w-full px-4 py-2 rounded-md text-sm"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            autoFocus
          />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-center text-xs py-12" style={{ color: "var(--text-muted)" }}>
              Loading integrations...
            </p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
                {tools.length === 0 ? "Нет интеграций в библиотеке" : "Ничего не найдено"}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {tools.length === 0
                  ? "Создай первую интеграцию во вкладке Integrations"
                  : "Попробуй другой поисковый запрос"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((t) => {
                const isSelected = selected.has(t.name);
                const { letter, bg } = iconFor(t.name);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t)}
                    className="text-left rounded-lg p-3 flex items-start gap-3 transition-colors"
                    style={{
                      background: isSelected ? "var(--bg-hover)" : "var(--bg-secondary)",
                      border: `1px solid ${isSelected ? "#0cce6b" : "var(--border)"}`,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-sm font-semibold text-white"
                      style={{ background: bg }}
                    >
                      {letter}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {t.name}
                        </span>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded shrink-0 font-mono"
                          style={{
                            background: isSelected ? "#0cce6b" : "var(--bg-card)",
                            color: isSelected ? "#000" : "var(--text-muted)",
                          }}
                        >
                          {isSelected ? "✓ Added" : "+ Add"}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-2" style={{ color: "var(--text-muted)" }}>
                        {t.description || t.url || "(no description)"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <Link
            href="/tools"
            target="_blank"
            className="text-xs hover:underline"
            style={{ color: "var(--accent-light, #3291ff)" }}
          >
            Не нашёл нужную? Создай во вкладке Integrations →
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {selected.size} attached
            </span>
            <button
              onClick={handleDone}
              className="text-xs px-3 py-1.5 rounded-md font-medium"
              style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
