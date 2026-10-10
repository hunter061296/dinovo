import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { as, at, makeDinnerShift, makeGuest, mins } from "./helpers";

describe("pacing caps", () => {
  it("applies the 9pm slot's cap in the restaurant's timezone", async () => {
    const host = await as("HOST");
    const shift = await makeDinnerShift();
    await prisma.pacingRule.create({ data: { shiftId: shift.id, timeSlotMinutes: mins(21), maxCovers: 4, maxPartySize: 6 } });

    const g1 = await makeGuest();
    const first = await host.post("/api/reservations", { guestId: g1.id, partySize: 4, dateTime: at(21).toISOString() });
    expect(first.body.overCap).toBe(false);

    const g2 = await makeGuest();
    const second = await host.post("/api/reservations", { guestId: g2.id, partySize: 2, dateTime: at(21, 15).toISOString() });
    expect(second.status).toBe(201); // a warning, never a block
    expect(second.body.overCap).toBe(true);
    expect(second.body.capDetail).toMatch("6/4 covers");
  });

  it("doesn't count excluded parties", async () => {
    const host = await as("HOST");
    const shift = await makeDinnerShift();
    await prisma.pacingRule.create({ data: { shiftId: shift.id, timeSlotMinutes: mins(19), maxCovers: 4, maxPartySize: 6 } });
    const g1 = await makeGuest();
    await host.post("/api/reservations", { guestId: g1.id, partySize: 4, dateTime: at(19).toISOString(), excludeFromPacing: true });
    const g2 = await makeGuest();
    const res = await host.post("/api/reservations", { guestId: g2.id, partySize: 4, dateTime: at(19).toISOString() });
    expect(res.body.overCap).toBe(false);
  });
});
