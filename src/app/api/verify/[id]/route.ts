import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getOrderForVerification } from "@/lib/services/verificationService";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteParams) {
  const auth = await requireRole(["cutting_verifier"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { error: "Order ID is required" },
      { status: 400 },
    );
  }

  const result = await getOrderForVerification(id);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({ order: result.order }, { status: 200 });
}
