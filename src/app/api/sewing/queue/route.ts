import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { listSewingQueue } from "@/lib/services/sewingService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  const auth = await requireRole(["sewing_supervisor"]);
  if (!auth.ok) {
    return auth.response;
  }

  const orders = await listSewingQueue();
  return NextResponse.json({ orders });
}