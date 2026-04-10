"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.href = "/";
    setLoading(false);
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-sm p-8 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <h1 className="text-xl font-semibold text-center mb-6" style={{ color: "var(--text-primary)" }}>Sign In to AgentFlow</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          {error && <p className="text-xs" style={{ color: "#ee0000" }}>{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          No account? <Link href="/signup" style={{ color: "var(--text-primary)" }}>Sign Up</Link>
        </p>
      </div>
    </div>
  );
}
