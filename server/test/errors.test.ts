import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, as, makeGuest } from "./helpers";

describe("error handling", () => {
  it("rejects a reservation for a guest that doesn't exist, and keeps serving", async () => {
    const host = await as("HOST");
    const res = await host.post("/api/reservations", {
      guestId: "00000000-0000-4000-8000-000000000000",
      partySize: 2,
      dateTime: "2026-10-10T23:00:00Z",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/guest not found/i);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("rejects an unknown table instead of hitting a foreign-key error", async () => {
    const host = await as("HOST");
    const guest = await makeGuest();
    const res = await host.post("/api/reservations", {
      guestId: guest.id,
      partySize: 2,
      dateTime: "2026-10-10T23:00:00Z",
      tableId: "00000000-0000-4000-8000-000000000000",
    });
    expect(res.status).toBe(400);
  });

  it("turns a database error thrown inside a route into a response, not a crash", async () => {
    const manager = await as("MANAGER");
    // Deleting a row that doesn't exist throws Prisma P2025 out of the async handler.
    const res = await manager.del("/api/table-combinations/00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("answers malformed JSON with a 400", async () => {
    const host = await as("HOST");
    const res = await request(app)
      .post("/api/waitlist")
      .set("Authorization", `Bearer ${host.token}`)
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
  });

  it("answers an unknown API route with JSON", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});
