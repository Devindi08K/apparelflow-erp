import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { rejectOrder } from "@/lib/services/verificationService";
import { rejectSchema } from "@/lib/validation/verification";
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

  // 2. Parse and validate body with rejectSchema
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { errors: { _form: "Invalid JSON body" } },
      { status: 422 },
    );
  }

  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: zodErrorToFieldErrors(parsed.error) },
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

  // 3. Execute rejectOrder; verifierId always from the JWT session
  const result = await rejectOrder(id, auth.user.id, parsed.data.note);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result, { status: 200 });
}
