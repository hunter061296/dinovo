import { afterAll, beforeEach } from "vitest";
import type { Server } from "socket.io";
import { setIO } from "../src/lib/socket";
import { prisma } from "../src/lib/prisma";
import { resetDb } from "./helpers";

// Routes broadcast through getIO(); tests record the events instead of running a socket server.
export const emitted: { event: string; payload: unknown }[] = [];
setIO({ emit: (event: string, payload: unknown) => emitted.push({ event, payload }) } as unknown as Server);

beforeEach(async () => {
  emitted.length = 0;
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
