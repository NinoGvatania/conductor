"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

const AUTH_ROUTES = ["/login", "/signup"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <div className="flex pt-12 min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-56">
          <div className="p-6 max-w-6xl">{children}</div>
        </main>
      </div>
    </>
  );
}
