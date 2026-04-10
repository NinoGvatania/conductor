"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

interface Conversation {
  id: string;
  title: string;
  initiated_by: string;
  updated_at: string;
  created_at: string;
}

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/workflows", label: "Workflows" },
  { href: "/agents", label: "Agents" },
  { href: "/tools", label: "Tools" },
  { href: "/settings", label: "Settings" },
];

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const groups: Record<string, Conversation[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const c of conversations) {
    const d = new Date(c.updated_at || c.created_at);
    let group: string;
    if (d >= today) group = "Today";
    else if (d >= yesterday) group = "Yesterday";
    else if (d >= weekAgo) group = "This week";
    else group = "Older";
    (groups[group] = groups[group] || []).push(c);
  }
  return groups;
}

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeConvId = searchParams.get("id");
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    api.listConversations().then((c) => setConversations(c as Conversation[])).catch(console.error);
  }, [pathname]);

  const grouped = groupByDate(conversations);
  const groupOrder = ["Today", "Yesterday", "This week", "Older"];
  const isOnChat = pathname === "/chat";

  return (
    <aside className="w-56 flex flex-col fixed h-[calc(100vh-48px)] top-12" style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}>
      {/* Navigation */}
      <nav className="px-3 pt-3 pb-1 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-md text-[13px] transition-colors"
              style={{
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "rgba(255,255,255,0.06)" : "transparent",
                fontWeight: active ? 500 : 400,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Divider + New Session */}
      <div className="px-3 pt-3 pb-1" style={{ borderTop: "1px solid var(--border)", marginTop: 8 }}>
        <Link
          href="/chat"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-colors w-full"
          style={{ color: "var(--text-secondary)" }}
        >
          <span style={{ fontSize: 13, opacity: 0.6 }}>+</span>
          <span>New session</span>
        </Link>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {groupOrder.map((group) => {
          const items = grouped[group];
          if (!items || items.length === 0) return null;
          return (
            <div key={group}>
              <div className="pt-3 pb-1">
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{group}</span>
              </div>
              {items.map((c) => {
                const isActive = isOnChat && activeConvId === c.id;
                const isAgent = c.initiated_by === "agent";
                return (
                  <Link
                    key={c.id}
                    href={`/chat?id=${c.id}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] mb-px transition-colors"
                    style={{
                      color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                      background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    {isAgent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#f59e0b" }} />}
                    <span className="truncate">{c.title || "New Chat"}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
