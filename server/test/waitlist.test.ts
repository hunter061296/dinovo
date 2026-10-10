import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { as, makeTable } from "./helpers";

describe("waitlist", () => {
  it("can't seat the same party twice", async () => {
    const host = await as("HOST");
    const [t1, t2] = [await makeTable(2), await makeTable(2)];
    const entry = await host.post("/api/waitlist", { guestName: "Walk-in", partySize: 2 });
    expect((await host.post(`/api/waitlist/${entry.body.id}/seat`, { tableId: t1.id })).status).toBe(200);
    const again = await host.post(`/api/waitlist/${entry.body.id}/seat`, { tableId: t2.id });
    expect(again.status).toBe(409);
    expect((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: t2.id } })).status).toBe("OPEN");
  });

  it("won't seat at a table that isn't open, even if two hosts try at once", async () => {
    const host = await as("HOST");
    const table = await makeTable(2);
    const a = await host.post("/api/waitlist", { guestName: "A", partySize: 2 });
    const b = await host.post("/api/waitlist", { guestName: "B", partySize: 2 });
    const results = await Promise.all([
      host.post(`/api/waitlist/${a.body.id}/seat`, { tableId: table.id }),
      host.post(`/api/waitlist/${b.body.id}/seat`, { tableId: table.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("won't seat at a table that's blocked right now", async () => {
    const host = await as("HOST");
    const table = await makeTable(2);
    const now = Date.now();
    await prisma.tableBlock.create({ data: { tableId: table.id, startsAt: new Date(now - 60_000), endsAt: new Date(now + 3_600_000), reason: "Wobbly" } });
    const entry = await host.post("/api/waitlist", { guestName: "Walk-in", partySize: 2 });
    const res = await host.post(`/api/waitlist/${entry.body.id}/seat`, { tableId: table.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/blocked/);
  });

  it("quotes from configured turn times", async () => {
    const host = await as("HOST");
    await prisma.turnTime.create({ data: { shiftId: null, maxPartySize: 4, minutes: 40 } });
    const table = await makeTable(2);
    // Occupied as of right now, so the quote is the full turn plus reset time.
    await prisma.restaurantTable.update({ where: { id: table.id }, data: { status: "SEATED", statusUpdatedAt: new Date() } });
    const entry = await host.post("/api/waitlist", { guestName: "Walk-in", partySize: 2 });
    expect(entry.body.quotedWaitMinutes).toBe(45);
  });
});
