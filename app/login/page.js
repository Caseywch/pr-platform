"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "../Logo";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pinValid = /^[0-9]{6}$/.test(pin);
  const canSubmit = email.trim() && pinValid && !loading;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!canSubmit) return;
    setLoading(true);
    try {
      // The PIN is passed through as the account's password, so it stays
      // protected by the same tested sign-in mechanism a password would use.
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: pin,
      });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (err) {
      const msg = err.message || "";
      setError(
        /invalid login credentials/i.test(msg)
          ? "That email and PIN don't match. Please try again."
          : msg || "Something went wrong. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-lg p-6">
        <div className="flex flex-col items-center mb-5">
          <Logo height={48} />
          <div className="text-xs uppercase tracking-widest text-neutral-600 mt-3 text-center">
            Purchase Requisition Platform
          </div>
        </div>

        <p className="text-sm text-neutral-600 mb-4 text-center">Sign in with your email and PIN</p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            autoComplete="username"
            className="border border-neutral-300 rounded-md px-3 py-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              className="border border-neutral-300 rounded-md px-3 py-2 text-sm w-full tracking-[0.5em] text-center"
              placeholder="......"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            <div className="text-xs text-neutral-600 mt-1 text-center">6-digit PIN</div>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</div>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md py-2 text-sm font-medium"
            style={{ background: canSubmit ? "#171717" : "#d4d4d4", color: "white" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="text-xs text-neutral-600 mt-5 text-center">
          Accounts are created by your Administrator. If you've forgotten your PIN, ask them to reset it for you.
        </div>
      </div>
    </div>
  );
}
