"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={loggingOut}
      className="rounded-md border border-slate-400 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
    >
      {loggingOut ? "Logging out..." : "Logout"}
    </button>
  );
}
