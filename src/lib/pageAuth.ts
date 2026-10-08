import type { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth";

const HOME_BY_ROLE: Record<UserRole, string> = {
  cutting_supervisor: "/supervisor",
  cutting_verifier: "/verifier",
  sewing_supervisor: "/sewing",
};

export async function requirePageRole(role: UserRole): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== role) {
    redirect(HOME_BY_ROLE[user.role]);
  }

  return user;
}
