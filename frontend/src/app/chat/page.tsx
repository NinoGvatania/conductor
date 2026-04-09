"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface Conversation { id: string; title: string; initiated_by: string; agent_name: string | null; created_at: string; }
interface Message { id: string; role: string; content: string; created_at: string; }

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listConversations().then((c) => setConversations(c as Conversation[])).catch(() => {});
  }, []);

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

    // Optimistic: show user message immediately
    const tempMsg: Message = { id: "temp", role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const result = (await api.sendMessage(text, activeConv || undefined)) as {
        conversation_id: string;
        message: Message;
      };

      if (!activeConv) {
        setActiveConv(result.conversation_id);
        api.listConversations().then((c) => setConversations(c as Conversation[])).catch(() => {});
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

  function handleNewChat() {
    setActiveConv(null);
    setMessages([]);
  }

  return (
    <div className="flex -m-6 h-[calc(100vh-48px)]">
      {/* Conversation list */}
      <div className="w-64 flex flex-col" style={{ borderRight: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <div className="p-3">
          <button onClick={handleNewChat} className="w-full px-3 py-2 rounded-md text-sm font-medium text-left" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConv(c.id)}
              className="w-full text-left px-3 py-2 rounded-md text-xs mb-0.5 truncate transition-colors"
              style={{
                color: activeConv === c.id ? "var(--text-primary)" : "var(--text-muted)",
                background: activeConv === c.id ? "var(--bg-hover)" : "transparent",
              }}
            >
              {c.initiated_by === "agent" && <span style={{ color: "var(--accent)" }}>● </span>}
              {c.title}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full">
              <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>What are we working on?</h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Describe a task and I will coordinate the agents</p>
            </div>
          )}
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: m.role === "user" ? "var(--accent)" : "var(--bg-card)",
                    color: m.role === "user" ? "#fff" : "var(--text-primary)",
                    border: m.role === "user" ? "none" : "1px solid var(--border)",
                  }}
                >
                  {m.content}
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
    </div>
  );
}
