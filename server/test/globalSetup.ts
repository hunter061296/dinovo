import { execSync } from "child_process";

// Applies migrations to the test database once per run. Refuses to touch a database whose name
// doesn't say "test", since every test truncates all tables.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL || "postgresql://dinovo:dinovo_dev_pw@localhost:5432/dinovo_test?schema=public";
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("test")) {
    throw new Error(`Refusing to run tests against "${dbName}" — TEST_DATABASE_URL must point at a dedicated test database.`);
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
