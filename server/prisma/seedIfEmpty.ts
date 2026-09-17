import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "./seedData";

const prisma = new PrismaClient();

// Runs on every deploy (see render.yaml's startCommand), but only actually seeds an empty
// database — a redeploy of an already-seeded environment must never wipe real data.
async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(`Database already has ${userCount} user(s) — skipping seed.`);
    return;
  }
  await seedDatabase(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
