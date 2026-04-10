"use client";

import { useState, useEffect, useRef, Suspense } from "react";
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
  const messagesEnd = useRef<HTMLDivElement>(null);

  // Sync with URL param
  useEffect(() => {
    setActiveConv(convId);
  }, [convId]);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConv) {
      api.getMessages(activeConv).then((m) => setMessages(m as Message[])).catch(() => {});
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
      const result = (await api.sendMessage(text, activeConv || undefined)) as {
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
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
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
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Describe a task for your agents..."
            disabled={sending}
            className="flex-1 px-4 py-3 rounded-xl text-sm"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-4 py-3 rounded-xl text-sm font-medium disabled:opacity-30"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
