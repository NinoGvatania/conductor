"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";

interface Message { role: string; content: string; }

interface AgentChatHelperProps {
  onSuggestion?: (field: string, value: string) => void;
}

export default function AgentChatHelper({ onSuggestion }: AgentChatHelperProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I can help you create an agent. Describe what you need — e.g. \"I need an agent that processes invoices and extracts amounts\" — and I'll suggest a configuration." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const text = input;
    setInput("");
    setMessages((p) => [...p, { role: "user", content: text }]);
    setLoading(true);

    try {
      const result = (await api.sendMessage(
        `Help me configure an AI agent. The user says: "${text}"\n\nRespond with specific suggestions for: name, description, system_prompt, model tier (fast/balanced/powerful), and what tools/knowledge bases might be needed. Be concise and practical.`
      )) as { message: { content: string } };
      setMessages((p) => [...p, { role: "assistant", content: result.message.content }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "Sorry, I couldn't process that. Try describing what your agent should do." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full rounded-lg overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="px-3 py-2 text-xs font-medium" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
        AI Assistant
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap" style={{
              background: m.role === "user" ? "#6366f1" : "var(--bg-secondary)",
              color: m.role === "user" ? "#fff" : "var(--text-secondary)",
              border: m.role === "user" ? "none" : "1px solid var(--border)",
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl text-xs" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>Thinking...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-2" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Describe your agent..."
            disabled={loading}
            className="flex-1 px-2 py-1.5 rounded text-xs"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="px-2 py-1.5 rounded text-xs font-medium disabled:opacity-30" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>→</button>
        </div>
      </div>
    </div>
  );
}
