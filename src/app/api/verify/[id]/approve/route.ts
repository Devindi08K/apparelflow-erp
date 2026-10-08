import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { approveOrder } from "@/lib/services/verificationService";
import { approveSchema } from "@/lib/validation/verification";
import { zodErrorToFieldErrors } from "@/lib/validation/order";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: Request, context: RouteParams) {
  // 1. RBAC check FIRST (401/403)
  const auth = await requireRole(["cutting_verifier"]);
  if (!auth.ok) {
    return auth.response;
  }

  // 2. Validate with approveSchema (reject extra/unexpected client payload)
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { errors: { _form: "Invalid JSON body" } },
      { status: 422 },
    );
  }

  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Approval takes no client data; extra keys are rejected.",
        errors: zodErrorToFieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { error: "Order ID is required" },
      { status: 400 },
    );
  }

  // 3. Execute approveOrder with verifier ID from session JWT
  const result = await approveOrder(id, auth.user.id);

  if (!result.ok) {
    if (result.status === 422 && "reasons" in result) {
      return NextResponse.json(
        { error: result.error, reasons: result.reasons },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result, { status: 200 });
}
