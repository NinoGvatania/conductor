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
  connection_id?: string | null;
}

interface Connection {
  id: string;
  name: string;
  description: string;
  base_url: string;
}

/** Shape stored on the agent's `tools` array. Backward-compatible with the
 *  old `{name, description}` — we enrich with connection_id/connection_name
 *  when the tool comes from an integration so the form can render collapsed
 *  chips per integration. */
export interface AttachedTool {
  name: string;
  description: string;
  connection_id?: string | null;
  connection_name?: string | null;
}

interface IntegrationPickerProps {
  /** Tools already attached to the agent (keeps selection state in sync). */
  selectedNames: string[];
  /** Called with the complete new set of attached tools when the user hits Done. */
  onConfirm: (tools: AttachedTool[]) => void;
  onClose: () => void;
}

type Item =
  | {
      kind: "connection";
      id: string;
      title: string;
      subtitle: string;
      tools: Tool[];
    }
  | {
      kind: "orphan";
      id: string;
      title: string;
      subtitle: string;
      tool: Tool;
    };

/**
 * Claude-style Directory picker for integrations.
 *
 * Shows the user's **Connections** as cards (e.g. "Telegram", "Figma") — NOT
 * individual HTTP methods. Clicking a card attaches every tool belonging to
 * that connection to the agent. Tools with no parent connection fall back to
 * a per-tool card so you can still attach one-off custom tools.
 *
 * Rationale: an agent user thinks in services, not in methods. The old picker
 * leaked technical `method_name` identifiers into the UI and forced the user
 * to know what each one did.
 */
export default function ToolPicker({ selectedNames, onConfirm, onClose }: IntegrationPickerProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch both connections and tools in parallel. Tools are joined back to
  // their connection_id client-side.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [t, c] = await Promise.all([
          api.listTools() as Promise<Tool[]>,
          api.listConnections() as Promise<Connection[]>,
        ]);
        if (cancelled) return;
        setTools(t || []);
        setConnections(c || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the flat item list: connections (each wrapping its tools) first,
  // then orphan tools that don't belong to any connection.
  const items: Item[] = useMemo(() => {
    const byConn = new Map<string, Tool[]>();
    const orphans: Tool[] = [];
    for (const t of tools) {
      if (t.connection_id) {
        const arr = byConn.get(t.connection_id) || [];
        arr.push(t);
        byConn.set(t.connection_id, arr);
      } else {
        orphans.push(t);
      }
    }
    const out: Item[] = [];
    for (const c of connections) {
      const myTools = byConn.get(c.id) || [];
      if (myTools.length === 0) continue; // skip empty connections
      out.push({
        kind: "connection",
        id: `conn:${c.id}`,
        title: c.name,
        subtitle: c.description || `${myTools.length} действи${myTools.length === 1 ? "е" : "й"} доступно`,
        tools: myTools,
      });
    }
    for (const t of orphans) {
      out.push({
        kind: "orphan",
        id: `tool:${t.id}`,
        title: t.name,
        subtitle: t.description || t.url || "(no description)",
        tool: t,
      });
    }
    return out;
  }, [tools, connections]);

  // Initialize selection state from the tools already attached to the agent.
  // A connection is selected if ANY of its tools is in selectedNames.
  useEffect(() => {
    if (loading) return;
    const picked = new Set<string>();
    const attachedNames = new Set(selectedNames);
    for (const item of items) {
      if (item.kind === "connection") {
        const anyAttached = item.tools.some((t) => attachedNames.has(t.name));
        if (anyAttached) picked.add(item.id);
      } else {
        if (attachedNames.has(item.tool.name)) picked.add(item.id);
      }
    }
    setSelectedIds(picked);
  }, [items, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDone() {
    const result: AttachedTool[] = [];
    for (const item of items) {
      if (!selectedIds.has(item.id)) continue;
      if (item.kind === "connection") {
        const conn = connections.find((c) => `conn:${c.id}` === item.id);
        const connName = conn?.name || item.title;
        for (const t of item.tools) {
          result.push({
            name: t.name,
            description: t.description || "",
            connection_id: t.connection_id || null,
            connection_name: connName,
          });
        }
      } else {
        result.push({
          name: item.tool.name,
          description: item.tool.description || "",
          connection_id: null,
          connection_name: null,
        });
      }
    }
    onConfirm(result);
    onClose();
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((item) => {
      if (item.title.toLowerCase().includes(q)) return true;
      if (item.subtitle.toLowerCase().includes(q)) return true;
      if (item.kind === "connection") {
        return item.tools.some((t) => t.name.toLowerCase().includes(q));
      }
      return false;
    });
  }, [items, search]);

  // Icon helper — colored square with first letter, palette is deterministic
  function iconFor(title: string): { letter: string; bg: string } {
    const letter = (title[0] || "?").toUpperCase();
    const palette = ["#6366f1", "#0cce6b", "#f5a623", "#ec4899", "#3291ff", "#a855f7", "#14b8a6"];
    const idx = (title.charCodeAt(0) || 0) % palette.length;
    return { letter, bg: palette[idx] };
  }

  const selectedCount = selectedIds.size;

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
              Подключи готовые интеграции к этому агенту
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
                {items.length === 0 ? "Нет интеграций" : "Ничего не найдено"}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {items.length === 0
                  ? "Создай первую интеграцию во вкладке Integrations"
                  : "Попробуй другой поисковый запрос"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const { letter, bg } = iconFor(item.title);
                const toolCount =
                  item.kind === "connection" ? item.tools.length : 1;
                return (
                  <button
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    className="text-left rounded-lg p-3 flex items-start gap-3 transition-colors"
                    style={{
                      background: isSelected ? "var(--bg-hover)" : "var(--bg-secondary)",
                      border: `1px solid ${isSelected ? "#0cce6b" : "var(--border)"}`,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 text-base font-semibold text-white"
                      style={{ background: bg }}
                    >
                      {letter}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {item.title}
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
                      <p className="text-xs line-clamp-2 mb-1" style={{ color: "var(--text-muted)" }}>
                        {item.subtitle}
                      </p>
                      {item.kind === "connection" && (
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {toolCount} action{toolCount === 1 ? "" : "s"}
                        </p>
                      )}
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
              {selectedCount} attached
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
