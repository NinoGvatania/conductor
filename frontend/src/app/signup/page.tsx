"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { setAuth } from "@/lib/auth";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = (await api.register(email, password, name)) as { token: string; user: { id: string; email: string; name: string } };
      setAuth(result.token, result.user);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  const s = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-sm p-8 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <h1 className="text-xl font-semibold text-center mb-6" style={{ color: "var(--text-primary)" }}>Create Account</h1>
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full px-3 py-2 rounded-md text-sm" style={s} />
          </div>
          {error && <p className="text-xs" style={{ color: "#ee0000" }}>{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
            {loading ? "Creating..." : "Sign Up"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          Have an account? <Link href="/login" style={{ color: "var(--text-primary)" }}>Sign In</Link>
        </p>
      </div>
    </div>
  );
}
