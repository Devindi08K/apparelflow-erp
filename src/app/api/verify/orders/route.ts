import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { listOrdersForVerification } from "@/lib/services/verificationService";

export async function GET() {
  const auth = await requireRole(["cutting_verifier"]);
  if (!auth.ok) {
    return auth.response;
  }

  const orders = await listOrdersForVerification();
  return NextResponse.json({ orders });
}
