"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

interface Conversation {
  id: string;
  title: string;
  initiated_by: string;
  agent_name: string | null;
  updated_at: string;
}

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/workflows", label: "Workflows" },
  { href: "/agents", label: "Agents" },
  { href: "/tools", label: "Tools" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    api.listConversations().then((c) => setConversations(c as Conversation[])).catch(() => {});
  }, [pathname]);

  return (
    <aside className="w-56 flex flex-col fixed h-[calc(100vh-48px)] top-12 overflow-hidden" style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}>
      {/* Navigation */}
      <nav className="py-3 px-2 flex flex-col gap-px">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href) && item.href !== "/chat");
          return (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-md text-[13px] transition-colors"
              style={{
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "var(--bg-hover)" : "transparent",
                fontWeight: active ? 500 : 400,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 mb-1" style={{ borderTop: "1px solid var(--border)" }} />

      {/* Chat History */}
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>Chats</span>
        <Link href="/chat" className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>+</Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.map((c) => {
          const isActive = pathname === `/chat?id=${c.id}` || pathname === `/chat/${c.id}`;
          const isAgent = c.initiated_by === "agent";
          return (
            <Link
              key={c.id}
              href={`/chat?id=${c.id}`}
              className="flex items-start gap-2 px-2 py-1.5 rounded-md text-[12px] mb-0.5 transition-colors group"
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                background: isActive ? "var(--bg-hover)" : "transparent",
              }}
            >
              {isAgent && (
                <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: "#f59e0b" }} />
              )}
              <span className="truncate leading-tight">{c.title || "New Chat"}</span>
            </Link>
          );
        })}
        {conversations.length === 0 && (
          <p className="text-[11px] px-2 py-2" style={{ color: "var(--text-muted)" }}>No chats yet</p>
        )}
      </div>
    </aside>
  );
}
