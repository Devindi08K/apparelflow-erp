import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import {
  createOrder,
  listCuttingOrdersForSupervisor,
} from "@/lib/services/orderService";


export async function GET() {
  const auth = await requireRole(["cutting_supervisor"]);
  if (!auth.ok) {
    return auth.response;
  }

  const orders = await listCuttingOrdersForSupervisor();
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const auth = await requireRole(["cutting_supervisor"]);
  if (!auth.ok) {
    return auth.response;
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

  // userId always from JWT session — never from the body
  try {
    const result = await createOrder(auth.user.id, body);

    if (!result.ok) {
      if (result.status === 422) {
        return NextResponse.json({ errors: result.errors }, { status: 422 });
      }
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({ order: result.order }, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
