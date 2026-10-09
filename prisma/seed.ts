import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Demo@12345", 10);

  // 1. Seed Users
  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@apparelflow.test" },
    update: { passwordHash },
    create: {
      email: "supervisor@apparelflow.test",
      passwordHash,
      role: UserRole.cutting_supervisor,
      fullName: "Cutting Supervisor",
    },
  });

  const verifier = await prisma.user.upsert({
    where: { email: "verifier@apparelflow.test" },
    update: { passwordHash },
    create: {
      email: "verifier@apparelflow.test",
      passwordHash,
      role: UserRole.cutting_verifier,
      fullName: "Cutting Verifier",
    },
  });

  const sewing = await prisma.user.upsert({
    where: { email: "sewing@apparelflow.test" },
    update: { passwordHash },
    create: {
      email: "sewing@apparelflow.test",
      passwordHash,
      role: UserRole.sewing_supervisor,
      fullName: "Sewing Supervisor",
    },
  });

  console.log("Seeded users:", { supervisor: supervisor.email, verifier: verifier.email, sewing: sewing.email });

  // 2. Seed production recipes
  const recipes = [
    {
      recipeCode: "REC-BL01",
      name: "Casual Blouse",
      category: "Blouse",
      stdFabricYards: 1.8,
      wastageCap: 5.0,
      components: [
        { componentName: "Front Body Panel", piecesPerGarment: 1 },
        { componentName: "Back Body Panel", piecesPerGarment: 1 },
        { componentName: "Sleeves (Left & Right)", piecesPerGarment: 2 },
        { componentName: "Collar & Stand", piecesPerGarment: 1 },
        { componentName: "Sleeve Cuffs", piecesPerGarment: 2 },
      ],
    },
    {
      recipeCode: "REC-CT02",
      name: "Crop Top",
      category: "Crop Top",
      stdFabricYards: 1.1,
      wastageCap: 8.0,
      components: [
        { componentName: "Front Chest Panel", piecesPerGarment: 1 },
        { componentName: "Back Support Panel", piecesPerGarment: 1 },
        { componentName: "Neck Binding Strip", piecesPerGarment: 1 },
        { componentName: "Hem Elastic Casing", piecesPerGarment: 1 },
        { componentName: "Side Strap Accents", piecesPerGarment: 2 },
      ],
    },
  ];

  for (const recipe of recipes) {
    await prisma.recipe.upsert({
      where: { recipeCode: recipe.recipeCode },
      update: {
        name: recipe.name,
        category: recipe.category,
        stdFabricYards: recipe.stdFabricYards,
        wastageCap: recipe.wastageCap,
      },
      create: {
        ...recipe,
        components: { create: recipe.components },
      },
    });
  }

  console.log("Seeded recipes:", recipes.map(({ recipeCode }) => recipeCode));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
