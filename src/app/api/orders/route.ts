import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { listCuttingOrdersForSupervisor } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["cutting_supervisor"]);
  if (!auth.ok) {
    return auth.response;
  }

  const orders = await listCuttingOrdersForSupervisor();
  return NextResponse.json({ orders });
}
