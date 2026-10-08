import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { saveCounts } from "@/lib/services/verificationService";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: Request, context: RouteParams) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { errors: { _form: "Invalid JSON body" } },
      { status: 422 },
    );
  }

  const result = await saveCounts(id, body);

  if (!result.ok) {
    if (result.status === 422 && "errors" in result && result.errors) {
      return NextResponse.json({ errors: result.errors }, { status: 422 });
    }
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(
    {
      items: result.items,
      verificationItems: result.verificationItems,
      approval: result.approval,
    },
    { status: 200 },
  );
}
