"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "◫" },
  { href: "/chat", label: "Chat", icon: "◉" },
  { href: "/agents", label: "Agents", icon: "⬡" },
  { href: "/runs", label: "Runs", icon: "▷" },
  { href: "/approvals", label: "Approvals", icon: "◈" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-60 flex flex-col fixed h-screen"
      style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}
    >
      <div className="p-5 pb-2">
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          AgentFlow
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          AI Workforce Platform
        </p>
      </div>
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
              style={{
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "var(--bg-hover)" : "transparent",
              }}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>v0.1.0</p>
      </div>
    </aside>
  );
}
