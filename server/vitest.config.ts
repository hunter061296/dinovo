import { defineConfig } from "vitest/config";

// Integration tests run against a real Postgres database that gets truncated between tests, so
// it must be a dedicated one — see test/globalSetup.ts for the safety check.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgresql://dinovo:dinovo_dev_pw@localhost:5432/dinovo_test?schema=public";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setup.ts"],
    // One shared database: test files must not run concurrently.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test-secret",
      // Deliberately not the machine's zone (CI and Render run in UTC), so timezone handling is
      // actually exercised: a 9pm New York reservation is the next day in UTC.
      RESTAURANT_TIMEZONE: "America/New_York",
    },
  },
});
