import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { startSewing } from "@/lib/services/sewingService";

export const dynamic = "force-dynamic";

const startSewingSchema = z.object({}).strict();

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: Request, context: RouteParams) {
  const auth = await requireRole(["sewing_supervisor"]);
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { errors: { _form: "Request body must be an empty JSON object" } },
      { status: 422 },
    );
  }

  const parsed = startSewingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: { _form: "Request body must be an empty JSON object" } },
      { status: 422 },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const result = await startSewing(id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({ order: result.order }, { status: 200 });
}