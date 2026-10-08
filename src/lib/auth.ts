import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "af_session";

export type SessionUser = {
  id: string;
  role: UserRole;
};

type JwtPayload = {
  sub: string;
  role: UserRole;
};

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export async function signJwt(user: SessionUser): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getJwtSecret());
}

export async function verifyJwt(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const sub = payload.sub;
    const role = (payload as JwtPayload).role;

    if (!sub || !role) {
      return null;
    }

    return { id: sub, role };
  } catch {
    return null;
  }
}

/** Reads the session cookie and returns { id, role } or null. */
export async function getSessionUser(
  request?: NextRequest,
): Promise<SessionUser | null> {
  let token: string | undefined;

  if (request) {
    token = request.cookies.get(SESSION_COOKIE)?.value;
  } else {
    const jar = await cookies();
    token = jar.get(SESSION_COOKIE)?.value;
  }

  if (!token) {
    return null;
  }

  return verifyJwt(token);
}
