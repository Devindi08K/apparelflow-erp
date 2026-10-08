import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { listRecipesWithComponents } from "@/lib/services/orderService";


export async function GET() {
  const auth = await requireRole(["cutting_supervisor"]);
  if (!auth.ok) {
    return auth.response;
  }

  const recipes = await listRecipesWithComponents();
  return NextResponse.json({ recipes });
}
