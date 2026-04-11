"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Message {
  id: string;
  role: string;
  content: string;
}

interface BuilderChatProps {
  contextType: "agent_builder" | "workflow_builder";
  contextId?: string;
  title?: string;
  placeholder?: string;
}

export default function BuilderChat({ contextType, contextId, title, placeholder }: BuilderChatProps) {
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const text = input;
    setInput("");
    setSending(true);

    setMessages((prev) => [...prev, { id: "temp_" + Date.now(), role: "user", content: text }]);

    try {
      const result = (await api.sendBuilderMessage(text, contextType, contextId, convId || undefined)) as {
        conversation_id: string;
        message: Message;
      };
      if (!convId) setConvId(result.conversation_id);
      setMessages((prev) => [...prev.filter((m) => !m.id.startsWith("temp_")),
        { id: "user_" + Date.now(), role: "user", content: text },
        result.message,
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => !m.id.startsWith("temp_")),
        { id: "err_" + Date.now(), role: "assistant", content: `Error: ${e instanceof Error ? e.message : "failed"}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full rounded-lg overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {title && (
        <div className="px-4 py-2.5 text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
          {title}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-center mt-4" style={{ color: "var(--text-muted)" }}>
            {contextType === "agent_builder"
              ? "Describe what your agent should do. I'll suggest configuration."
              : "Describe your process. I'll suggest a workflow structure."}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap"
              style={{
                background: m.role === "user" ? "#6366f1" : "var(--bg-secondary)",
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
            <div className="px-3 py-2 rounded-xl text-xs" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-2" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={placeholder || "Describe your needs..."}
            disabled={sending}
            className="flex-1 px-3 py-1.5 rounded text-xs"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-30"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
