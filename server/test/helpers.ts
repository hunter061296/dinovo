import bcrypt from "bcrypt";
import request from "supertest";
import type { Role, TableShape } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { signToken } from "../src/lib/jwt";
import { createApp } from "../src/app";
import { zonedDateTime } from "../src/lib/time";

export const app = createApp();

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function makeUser(role: Role = "HOST", overrides: { isActive?: boolean } = {}) {
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2)}@test.dev`,
      passwordHash: await bcrypt.hash("password123", 4),
      name: `${role} user`,
      role,
      ...overrides,
    },
  });
  const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
  return { user, token };
}

// An authenticated supertest agent for a fresh user of `role`.
export async function as(role: Role = "HOST") {
  const { token, user } = await makeUser(role);
  const auth = { Authorization: `Bearer ${token}` };
  return {
    user,
    token,
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) => request(app).post(url).set(auth).send(body),
    patch: (url: string, body?: object) => request(app).patch(url).set(auth).send(body),
    put: (url: string, body?: object) => request(app).put(url).set(auth).send(body),
    del: (url: string) => request(app).delete(url).set(auth),
  };
}

let tableNumber = 1;
export function makeTable(capacity = 4, shape: TableShape = "SQUARE") {
  return prisma.restaurantTable.create({ data: { number: tableNumber++, capacity, shape } });
}

export function makeGuest(firstName = "Test") {
  return prisma.guest.create({ data: { firstName, lastName: "Guest" } });
}

export const mins = (h: number, m = 0) => h * 60 + m;

// A fixed Saturday, so shift dayOfWeek is stable. 2026-10-10 is a Saturday.
export const DAY = "2026-10-10";
export const SATURDAY = 6;
export const at = (h: number, m = 0, day = DAY) => zonedDateTime(day, mins(h, m));

export function makeDinnerShift(dayOfWeek = SATURDAY) {
  return prisma.shift.create({ data: { name: "Dinner", dayOfWeek, startMinutes: mins(17), endMinutes: mins(23) } });
}
