"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface KBFile {
  filename: string;
  size: number;
  uploaded_at: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  file_count: number;
  files: KBFile[];
  created_at: string | null;
}

export default function KnowledgePage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selected, setSelected] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const list = (await api.listKnowledgeBases()) as KnowledgeBase[];
      setKbs(list || []);
      // Keep the currently-selected KB in sync after uploads
      if (selected) {
        const fresh = list?.find((k) => k.id === selected.id) || null;
        setSelected(fresh);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await api.createKnowledgeBase(newName.trim(), newDescription.trim());
      setNewName("");
      setNewDescription("");
      setShowCreate(false);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this knowledge base? Files attached will be lost.")) return;
    try {
      await api.deleteKnowledgeBase(id);
      if (selected?.id === id) setSelected(null);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selected) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadKnowledgeBaseFile(selected.id, file);
      e.target.value = "";
      await refresh();
    } catch {
      alert("Upload failed");
    }
  }

  async function handleRemoveFile(filename: string) {
    if (!selected) return;
    if (!confirm(`Remove "${filename}"?`)) return;
    try {
      await api.removeKnowledgeBaseFile(selected.id, filename);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Knowledge Bases
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Загружай файлы в базы знаний и подключай их к агентам
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded-md text-sm font-medium"
          style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
        >
          + New Knowledge Base
        </button>
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-lg p-5"
            style={cardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              New Knowledge Base
            </h3>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Product documentation"
              className="w-full px-3 py-2 rounded-md text-sm mb-2"
              style={{ ...cardStyle, color: "var(--text-primary)" }}
              autoFocus
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Что внутри этой базы знаний..."
              rows={3}
              className="w-full px-3 py-2 rounded-md text-sm mb-3"
              style={{ ...cardStyle, color: "var(--text-primary)" }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 rounded-md text-xs"
                style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
                style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* KB list */}
        <div className="w-72 shrink-0 space-y-2">
          {loading ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : kbs.length === 0 ? (
            <div className="rounded-lg p-4 text-center" style={cardStyle}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Нет баз знаний. Создай первую →
              </p>
            </div>
          ) : (
            kbs.map((kb) => {
              const isActive = selected?.id === kb.id;
              return (
                <button
                  key={kb.id}
                  onClick={() => setSelected(kb)}
                  className="w-full text-left rounded-lg p-3"
                  style={{
                    background: isActive ? "var(--bg-hover)" : "var(--bg-card)",
                    border: `1px solid ${isActive ? "var(--text-primary)" : "var(--border)"}`,
                  }}
                >
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {kb.name}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {kb.file_count} file{kb.file_count === 1 ? "" : "s"}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* KB detail */}
        <div className="flex-1 min-w-0">
          {selected ? (
            <div className="rounded-lg p-5" style={cardStyle}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                    {selected.name}
                  </h2>
                  {selected.description && (
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {selected.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: "#ee4444", border: "1px solid var(--border)" }}
                >
                  Delete
                </button>
              </div>

              <div
                className="rounded-md p-6 text-center mb-4"
                style={{ border: "1px dashed var(--border)" }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleUpload}
                  className="hidden"
                  accept=".txt,.md,.json,.csv,.html,.xml,.yaml,.yml,.py,.js,.ts,.tsx"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm px-4 py-2 rounded-md font-medium"
                  style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
                >
                  Upload a file
                </button>
                <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                  .txt, .md, .json, .csv, .html, .yaml — любые текстовые форматы
                </p>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                  Files ({selected.files.length})
                </div>
                {selected.files.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    No files yet
                  </p>
                ) : (
                  <div className="space-y-1">
                    {selected.files.map((f) => (
                      <div
                        key={f.filename}
                        className="flex items-center justify-between px-3 py-2 rounded-md"
                        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                            {f.filename}
                          </div>
                          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {(f.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveFile(f.filename)}
                          className="text-xs px-2"
                          style={{ color: "var(--text-muted)" }}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg p-8 text-center" style={cardStyle}>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Выбери базу знаний слева или создай новую
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
