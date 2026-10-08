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

  // 2. Seed Recipe
  const recipe = await prisma.recipe.upsert({
    where: { recipeCode: "RCP-TSHIRT-01" },
    update: {},
    create: {
      recipeCode: "RCP-TSHIRT-01",
      name: "Standard Crewneck T-Shirt",
      category: "Tops",
      stdFabricYards: 35.5,
      wastageCap: 5.0,
      components: {
        create: [
          { componentName: "Front Panel", piecesPerGarment: 1 },
          { componentName: "Back Panel", piecesPerGarment: 1 },
          { componentName: "Sleeves", piecesPerGarment: 2 },
          { componentName: "Collar Rib", piecesPerGarment: 1 },
        ],
      },
    },
  });

  console.log("Seeded recipe:", recipe);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
