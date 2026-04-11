"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  file_count: number;
}

/** Shape stored on the agent's `knowledge_bases` array when picked from the
 *  library. Keeps file_count for display but the runtime lookup happens
 *  server-side by id. */
export interface AttachedKnowledgeBase {
  id: string;
  name: string;
  description: string;
  file_count: number;
}

interface KnowledgePickerProps {
  selectedIds: string[];
  onConfirm: (kbs: AttachedKnowledgeBase[]) => void;
  onClose: () => void;
}

export default function KnowledgePicker({ selectedIds, onConfirm, onClose }: KnowledgePickerProps) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listKnowledgeBases()
      .then((list) => setKbs((list as KnowledgeBase[]) || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDone() {
    const picked = kbs
      .filter((k) => selected.has(k.id))
      .map((k) => ({
        id: k.id,
        name: k.name,
        description: k.description,
        file_count: k.file_count,
      }));
    onConfirm(picked);
    onClose();
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return kbs;
    return kbs.filter(
      (k) => k.name.toLowerCase().includes(q) || (k.description || "").toLowerCase().includes(q),
    );
  }, [kbs, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-lg flex flex-col"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Knowledge Bases
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Подключи базы знаний к этому агенту
            </p>
          </div>
          <button onClick={onClose} className="text-xl leading-none px-2" style={{ color: "var(--text-muted)" }}>
            ×
          </button>
        </div>

        <div className="px-6 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge bases..."
            className="w-full px-4 py-2 rounded-md text-sm"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-center text-xs py-12" style={{ color: "var(--text-muted)" }}>
              Loading...
            </p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
                {kbs.length === 0 ? "Нет баз знаний" : "Ничего не найдено"}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {kbs.length === 0 ? "Создай базу знаний во вкладке Knowledge" : "Попробуй другой запрос"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((kb) => {
                const isSelected = selected.has(kb.id);
                return (
                  <button
                    key={kb.id}
                    onClick={() => toggle(kb.id)}
                    className="w-full text-left rounded-lg p-3 flex items-start gap-3 transition-colors"
                    style={{
                      background: isSelected ? "var(--bg-hover)" : "var(--bg-secondary)",
                      border: `1px solid ${isSelected ? "#0cce6b" : "var(--border)"}`,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 text-base text-white"
                      style={{ background: "#6366f1" }}
                    >
                      📚
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {kb.name}
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
                        {kb.description || "(no description)"}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {kb.file_count} file{kb.file_count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="px-6 py-3 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <Link
            href="/knowledge"
            target="_blank"
            className="text-xs hover:underline"
            style={{ color: "var(--accent-light, #3291ff)" }}
          >
            Управление базами знаний →
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
