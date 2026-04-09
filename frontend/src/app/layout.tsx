import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentFlow",
  description: "Managed AI Workforce Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen" style={{ background: "var(--bg-primary)" }}>
          <Sidebar />
          <main className="flex-1 ml-60 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
