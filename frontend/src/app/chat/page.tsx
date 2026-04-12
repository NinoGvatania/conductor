"use client";

import { useState, useEffect, useRef, useLayoutEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

interface Message { id: string; role: string; content: string; created_at: string; }

export default function ChatPage() {
  return <Suspense><ChatContent /></Suspense>;
}

function ChatContent() {
  const searchParams = useSearchParams();
  const convId = searchParams.get("id");
  const [activeConv, setActiveConv] = useState<string | null>(convId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider: string }>>([]);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea up to a max height, then scroll internally
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const MAX_HEIGHT = 240;
    ta.style.height = Math.min(ta.scrollHeight, MAX_HEIGHT) + "px";
    ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [input]);

  // Load models from connected providers
  useEffect(() => {
    async function loadModels() {
      const providers = ["anthropic", "openai", "gemini", "mistral", "yandexgpt", "gigachat"];
      const allModels: Array<{ id: string; name: string; provider: string }> = [];
      for (const p of providers) {
        try {
          const models = (await api.getProviderModels(p)) as Array<{ id: string; name: string; provider?: string }>;
          if (Array.isArray(models) && models.length > 0) {
            allModels.push(...models.map((m) => ({ ...m, provider: m.provider || p })));
          }
        } catch {}
      }
      if (allModels.length > 0) setAvailableModels(allModels);
    }
    loadModels();
  }, []);

  // Sync with URL param
  useEffect(() => {
    setActiveConv(convId);
  }, [convId]);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConv) {
      api.getMessages(activeConv).then((m) => setMessages(m as Message[])).catch((e) => console.error(e));
    } else {
      setMessages([]);
    }
  }, [activeConv]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const text = input;
    setInput("");
    setSending(true);

    // Optimistic UI
    setMessages((prev) => [...prev, { id: "temp", role: "user", content: text, created_at: new Date().toISOString() }]);

    try {
      const result = (await api.sendMessage(text, activeConv || undefined, undefined, model)) as {
        conversation_id: string;
        message: Message;
      };

      if (!activeConv) {
        setActiveConv(result.conversation_id);
        window.history.replaceState(null, "", `/chat?id=${result.conversation_id}`);
      }

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== "temp"),
        { id: "user_" + Date.now(), role: "user", content: text, created_at: new Date().toISOString() },
        result.message,
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== "temp"),
        { id: "err", role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Failed"}`, created_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="-m-6 h-[calc(100vh-48px)] flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>What are we working on?</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Describe a task and I&apos;ll coordinate the agents</p>
          </div>
        )}
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <div key={m.id ?? i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[80%]">
                {m.role === "agent" && (
                  <div className="text-[10px] font-medium mb-1 px-1" style={{ color: "#f59e0b" }}>Agent</div>
                )}
                <div
                  className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: m.role === "user" ? "#6366f1" : m.role === "agent" ? "#1a1500" : "var(--bg-card)",
                    color: m.role === "user" ? "#fff" : "var(--text-primary)",
                    border: m.role === "user" ? "none" : `1px solid ${m.role === "agent" ? "#f59e0b33" : "var(--border)"}`,
                  }}
                >
                  {m.content}
                </div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>
      </div>

      {/* Input */}
      <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-1 mb-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="px-2 py-1 rounded text-[11px]"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              {availableModels.length > 0 ? (
                Object.entries(
                  availableModels.reduce((acc, m) => {
                    (acc[m.provider] = acc[m.provider] || []).push(m);
                    return acc;
                  }, {} as Record<string, typeof availableModels>)
                ).map(([provider, models]) => (
                  <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                ))
              ) : (
                <option value="" disabled>No providers connected — go to Settings</option>
              )}
            </select>
          </div>
          <div className="flex gap-2 items-end">
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
            placeholder="Describe a task for your agents... (Shift+Enter for newline)"
            disabled={sending}
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl text-sm resize-none leading-relaxed"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              minHeight: "48px",
              maxHeight: "240px",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-4 py-3 rounded-xl text-sm font-medium disabled:opacity-30 shrink-0"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
          >
            Send
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
