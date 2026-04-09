"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/chat", label: "Chat" },
  { href: "/agents", label: "Agents" },
  { href: "/runs", label: "Runs" },
  { href: "/approvals", label: "Approvals" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 flex flex-col fixed h-screen" style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}>
      <div className="h-14 flex items-center px-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>AgentFlow</span>
      </div>
      <nav className="flex-1 py-3 px-2 flex flex-col gap-px">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
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
    </aside>
  );
}
