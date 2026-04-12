"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Message {
  id: string;
  role: string;
  content: string;
}

interface CreatedEntity {
  type: "agent" | "workflow";
  id: string;
  name?: string;
}

interface ProviderModel {
  id: string;
  name: string;
  provider: string;
}

interface BuilderChatProps {
  contextType: "agent_builder" | "workflow_builder";
  contextId?: string;
  title?: string;
  placeholder?: string;
  onEntityCreated?: (entity: CreatedEntity) => void;
}

const PROVIDERS = ["anthropic", "openai", "gemini", "mistral", "yandexgpt", "gigachat"];

export default function BuilderChat({
  contextType,
  contextId,
  title,
  placeholder,
  onEntityCreated,
}: BuilderChatProps) {
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [model, setModelRaw] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("lastSelectedModel") || "";
    return "";
  });
  function setModel(id: string) {
    setModelRaw(id);
    if (typeof window !== "undefined" && id) localStorage.setItem("lastSelectedModel", id);
  }
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load the most recent existing conversation for this (contextType, contextId).
  // This is what makes the chat feel persistent — re-opening the same agent's
  // editor brings back the full conversation history instead of a blank chat.
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const convs = (await api.listBuilderConversations(contextType, contextId)) as Array<{
          id: string;
          updated_at: string | null;
        }>;
        if (cancelled || !Array.isArray(convs) || convs.length === 0) return;
        // The backend already sorts by updated_at desc — take the first
        const latest = convs[0];
        const msgs = (await api.getBuilderMessages(latest.id)) as Message[];
        if (cancelled) return;
        setConvId(latest.id);
        setMessages(msgs || []);
      } catch {
        // Fresh chat if anything fails
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [contextType, contextId]);

  // Load available models from connected providers (same pattern as /chat page)
  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      const all: ProviderModel[] = [];
      for (const p of PROVIDERS) {
        try {
          const models = (await api.getProviderModels(p)) as Array<{
            id: string;
            name: string;
            provider?: string;
          }>;
          if (Array.isArray(models) && models.length > 0) {
            all.push(...models.map((m) => ({ ...m, provider: m.provider || p })));
          }
        } catch {
          // provider not connected — skip silently
        }
      }
      if (cancelled) return;
      setAvailableModels(all);
      // If we already loaded a model from localStorage and it exists in the
      // list, keep it. Otherwise fall back to the first available model.
      if (model && all.some((m) => m.id === model)) {
        // keep current
      } else if (all.length > 0) {
        setModel(all[0].id);
      }
    }
    loadModels();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-resize textarea up to a max height, then scroll internally
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const MAX_HEIGHT = 180;
    ta.style.height = Math.min(ta.scrollHeight, MAX_HEIGHT) + "px";
    ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [input]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const text = input;
    setInput("");
    setSending(true);

    setMessages((prev) => [...prev, { id: "temp_" + Date.now(), role: "user", content: text }]);

    try {
      const result = (await api.sendBuilderMessage(
        text,
        contextType,
        contextId,
        convId || undefined,
        model || undefined,
      )) as {
        conversation_id: string;
        message: Message;
        created_entities?: CreatedEntity[];
      };
      if (!convId) setConvId(result.conversation_id);
      setMessages((prev) => [
        ...prev.filter((m) => !m.id.startsWith("temp_")),
        { id: "user_" + Date.now(), role: "user", content: text },
        result.message,
      ]);
      // Notify parent so it can refresh its list
      if (result.created_entities && result.created_entities.length > 0 && onEntityCreated) {
        for (const entity of result.created_entities) {
          onEntityCreated(entity);
        }
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => !m.id.startsWith("temp_")),
        {
          id: "err_" + Date.now(),
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : "failed"}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  // Group models by provider for the <optgroup>
  const modelsByProvider = availableModels.reduce<Record<string, ProviderModel[]>>((acc, m) => {
    (acc[m.provider] = acc[m.provider] || []).push(m);
    return acc;
  }, {});

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "var(--bg-secondary)" }}
    >
      {title && (
        <div
          className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
        >
          {title}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-center mt-4" style={{ color: "var(--text-muted)" }}>
            {contextType === "agent_builder"
              ? "Describe what your agent should do — I'll create it directly."
              : "Describe your process — I'll build the workflow for you."}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={m.id && m.id !== "None" ? m.id : `msg-${i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap"
              style={{
                background: m.role === "user" ? "#6366f1" : "var(--bg-card)",
                color: m.role === "user" ? "#fff" : "var(--text-secondary)",
                border: m.role === "user" ? "none" : "1px solid var(--border)",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2 rounded-xl text-xs"
              style={{
                background: "var(--bg-card)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              Thinking...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-2" style={{ borderTop: "1px solid var(--border)" }}>
        {/* Model selector */}
        <div className="mb-1.5">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-2 py-1 rounded text-[11px]"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            {availableModels.length > 0 ? (
              Object.entries(modelsByProvider).map(([provider, models]) => (
                <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))
            ) : (
              <option value="" disabled>
                No providers connected — go to Settings
              </option>
            )}
          </select>
        </div>
        <div className="flex gap-1 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={placeholder || "Describe your needs... (Shift+Enter for newline)"}
            disabled={sending}
            rows={1}
            className="flex-1 px-3 py-2 rounded text-xs resize-none leading-relaxed"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              minHeight: "32px",
              maxHeight: "180px",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-3 py-2 rounded text-xs font-medium disabled:opacity-30 shrink-0"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
