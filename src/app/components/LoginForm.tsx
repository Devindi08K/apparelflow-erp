"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type UserRole =
  | "cutting_supervisor"
  | "cutting_verifier"
  | "sewing_supervisor";

const HOME_BY_ROLE: Record<UserRole, string> = {
  cutting_supervisor: "/supervisor",
  cutting_verifier: "/verifier",
  sewing_supervisor: "/sewing",
};

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        user?: { role?: UserRole };
        error?: string;
      };

      if (!response.ok || !data.user?.role) {
        setError(data.error || "Unable to sign in. Check your email and password.");
        return;
      }

      router.push(HOME_BY_ROLE[data.user.role]);
      router.refresh();
    } catch {
      setError("Unable to reach the sign-in service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 max-w-md rounded-xl border border-slate-300 bg-white p-6 shadow-sm"
    >
      <h2 className="text-xl font-bold text-slate-950">Sign in to continue</h2>
      <p className="mt-2 text-sm text-slate-700">
        Use your work-area account to open the correct dashboard.
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-100 px-3 py-2 text-sm font-semibold text-red-950" role="alert">
          {error}
        </p>
      )}

      <label className="mt-5 block text-sm font-semibold text-slate-900" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-700"
      />

      <label className="mt-4 block text-sm font-semibold text-slate-900" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-700"
      />

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-md bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {submitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
