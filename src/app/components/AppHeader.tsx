import Link from "next/link";
import type { UserRole } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/app/components/LogoutButton";

const ROLE_LABELS: Record<UserRole, string> = {
  cutting_supervisor: "Cutting Supervisor",
  cutting_verifier: "Cutting Verifier",
  sewing_supervisor: "Sewing Supervisor",
};

const HOME_BY_ROLE: Record<UserRole, string> = {
  cutting_supervisor: "/supervisor",
  cutting_verifier: "/verifier",
  sewing_supervisor: "/sewing",
};

const NAV_BY_ROLE: Record<UserRole, Array<{ href: string; label: string }>> = {
  cutting_supervisor: [{ href: "/supervisor", label: "Cutting Orders" }],
  cutting_verifier: [{ href: "/verifier", label: "Verification Queue" }],
  sewing_supervisor: [{ href: "/sewing", label: "Sewing Queue" }],
};

export default async function AppHeader() {
  const session = await getSessionUser();
  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { fullName: true },
  });

  if (!user) {
    return null;
  }

  return (
    <header className="border-b border-slate-300 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href={HOME_BY_ROLE[session.role]} className="font-bold text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2">
            ApparelFlow ERP
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-900">{user.fullName}</span>
            <span className="rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-950">
              {ROLE_LABELS[session.role]}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav aria-label="Primary navigation" className="flex flex-wrap gap-2">
          {NAV_BY_ROLE[session.role].map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-1">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
