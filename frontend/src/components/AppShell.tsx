"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { AuthGuard } from "@/hooks/useAuth";

const AUTH_ROUTES = ["/login", "/signup"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <Header />
      <div className="flex pt-12 min-h-screen">
        <Suspense><Sidebar /></Suspense>
        <main className="flex-1 ml-56 min-w-0">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}
