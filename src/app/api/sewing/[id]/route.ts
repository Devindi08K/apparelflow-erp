import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getSewingOrder } from "@/lib/services/sewingService";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteParams) {
  const auth = await requireRole(["sewing_supervisor"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const order = await getSewingOrder(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ order });
}