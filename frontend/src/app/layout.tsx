import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentFlow",
  description: "AI Workforce Platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Header />
        <div className="flex pt-12 min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-48">
            <div className="p-6 max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
