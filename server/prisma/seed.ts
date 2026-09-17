import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "./seedData";

const prisma = new PrismaClient();

// Local dev entry point — always wipes and reseeds. Production deploys use seedIfEmpty.ts
// instead, which never touches a database that already has data.
seedDatabase(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
