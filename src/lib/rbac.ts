import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { getSessionUser, type SessionUser } from "@/lib/auth";

type RequireRoleSuccess = {
  ok: true;
  user: SessionUser;
};

type RequireRoleFailure = {
  ok: false;
  response: NextResponse;
};

/**
 * Server-side gate for API routes.
 * Identity always comes from the JWT cookie — never from the request body.
 */
export async function requireRole(
  allowedRoles: readonly UserRole[],
): Promise<RequireRoleSuccess | RequireRoleFailure> {
  const user = await getSessionUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}
