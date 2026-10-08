import { prisma } from "@/lib/prisma";

export async function listRecipesWithComponents() {
  return prisma.recipe.findMany({
    orderBy: { recipeCode: "asc" },
    include: {
      components: {
        orderBy: { componentName: "asc" },
      },
    },
  });
}

export async function listCuttingOrdersForSupervisor() {
  const orders = await prisma.cuttingOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      recipe: {
        select: { name: true },
      },
      createdBy: {
        select: { fullName: true },
      },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    targetQty: order.targetQty,
    fabricRollId: order.fabricRollId,
    actualFabricYds: order.actualFabricYds,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    recipeId: order.recipeId,
    recipeName: order.recipe.name,
    createdByName: order.createdBy.fullName,
  }));
}
