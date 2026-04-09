import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentFlow",
  description: "AI Workforce Platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-52">
            <div className="h-14 flex items-center px-6" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Production</span>
            </div>
            <div className="p-6 max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
