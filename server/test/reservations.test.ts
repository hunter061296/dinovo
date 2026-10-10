import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { DAY, as, at, makeDinnerShift, makeGuest, makeTable } from "./helpers";

async function book(client: Awaited<ReturnType<typeof as>>, body: Record<string, unknown>) {
  const guest = await makeGuest();
  return client.post("/api/reservations", { guestId: guest.id, partySize: 2, ...body });
}

describe("reservations in the restaurant's timezone", () => {
  it("lists a 9pm reservation on its own restaurant day and matches its shift", async () => {
    const host = await as("HOST");
    const shift = await makeDinnerShift();
    const created = await book(host, { dateTime: at(21).toISOString() });
    expect(created.status).toBe(201);
    expect(created.body.shiftId).toBe(shift.id);

    const today = await host.get(`/api/reservations?date=${DAY}`);
    expect(today.body.map((r: { id: string }) => r.id)).toContain(created.body.id);
    const tomorrow = await host.get("/api/reservations?date=2026-10-11");
    expect(tomorrow.body).toHaveLength(0);
  });
});

describe("table conflicts use turn times", () => {
  it("blocks an overlapping booking and allows one after the first party's turn", async () => {
    const host = await as("HOST");
    await makeDinnerShift();
    const table = await makeTable(2);
    await prisma.turnTime.create({ data: { shiftId: null, maxPartySize: 2, minutes: 75 } });

    expect((await book(host, { dateTime: at(19).toISOString(), tableId: table.id })).status).toBe(201);
    // 7:00 + 75 min = 8:15, so 8:00 overlaps...
    const clash = await book(host, { dateTime: at(20).toISOString(), tableId: table.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatch(/Table \d+ is already booked/);
    // ...and 8:15 doesn't.
    expect((await book(host, { dateTime: at(20, 15).toISOString(), tableId: table.id })).status).toBe(201);
  });

  it("honors a reservation's own duration override", async () => {
    const host = await as("HOST");
    const table = await makeTable(2);
    const first = await book(host, { dateTime: at(19).toISOString(), tableId: table.id, durationMinutes: 180 });
    expect(first.body.effectiveDurationMinutes).toBe(180);
    expect((await book(host, { dateTime: at(21).toISOString(), tableId: table.id })).status).toBe(409);
  });

  it("doesn't re-check conflicts when only a note changes", async () => {
    const host = await as("HOST");
    const table = await makeTable(2);
    const first = await book(host, { dateTime: at(19).toISOString(), tableId: table.id });
    // An overlapping booking from before conflict checks existed.
    const guest = await makeGuest();
    await prisma.reservation.create({ data: { guestId: guest.id, partySize: 2, dateTime: at(19, 30), tableId: table.id } });

    const res = await host.patch(`/api/reservations/${first.body.id}`, {
      tableId: table.id,
      dateTime: at(19).toISOString(),
      generalNote: "Window seat",
    });
    expect(res.status).toBe(200);
  });

  it("blocks a booking over a table block", async () => {
    const host = await as("HOST");
    const table = await makeTable(4);
    const block = await host.post("/api/table-blocks", { tableId: table.id, startsAt: at(18), endsAt: at(20), reason: "VIP hold" });
    expect(block.status).toBe(201);
    const res = await book(host, { dateTime: at(19).toISOString(), tableId: table.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/blocked.*VIP hold/);
  });

  it("won't create a block on top of an existing booking", async () => {
    const host = await as("HOST");
    const table = await makeTable(4);
    await book(host, { dateTime: at(19).toISOString(), tableId: table.id });
    const block = await host.post("/api/table-blocks", { tableId: table.id, startsAt: at(18), endsAt: at(20) });
    expect(block.status).toBe(409);
  });
});

describe("table combinations", () => {
  it("occupies every table in the combination", async () => {
    const host = await as("HOST");
    const manager = await as("MANAGER");
    const [t1, t2] = [await makeTable(4), await makeTable(4)];
    const combo = await manager.post("/api/table-combinations", { tableIds: [t1.id, t2.id] });
    expect(combo.status).toBe(201);
    expect(combo.body.capacity).toBe(8);

    const big = await book(host, { partySize: 8, dateTime: at(19).toISOString(), combinationId: combo.body.id });
    expect(big.status).toBe(201);
    expect(big.body.tableId).toBe(t1.id);

    // The second table is taken too, not just the combination's first.
    const clash = await book(host, { dateTime: at(19, 30).toISOString(), tableId: t2.id });
    expect(clash.status).toBe(409);
  });

  it("rejects a duplicate combination", async () => {
    const manager = await as("MANAGER");
    const [t1, t2] = [await makeTable(), await makeTable()];
    await manager.post("/api/table-combinations", { tableIds: [t1.id, t2.id] });
    expect((await manager.post("/api/table-combinations", { tableIds: [t2.id, t1.id] })).status).toBe(400);
  });

  it("is managed by managers, not hosts", async () => {
    const host = await as("HOST");
    const [t1, t2] = [await makeTable(), await makeTable()];
    expect((await host.post("/api/table-combinations", { tableIds: [t1.id, t2.id] })).status).toBe(403);
  });
});

describe("status transitions", () => {
  async function seatedOnCombo() {
    const host = await as("HOST");
    const manager = await as("MANAGER");
    const [t1, t2] = [await makeTable(4), await makeTable(4)];
    const combo = await manager.post("/api/table-combinations", { tableIds: [t1.id, t2.id] });
    const res = await book(host, { partySize: 8, dateTime: at(19).toISOString(), combinationId: combo.body.id });
    return { host, r: res.body, t1, t2 };
  }

  it("seating a combination seats every table, completing buses them all", async () => {
    const { host, r, t1, t2 } = await seatedOnCombo();
    await host.patch(`/api/reservations/${r.id}`, { status: "SEATED" });
    let tables = await prisma.restaurantTable.findMany({ where: { id: { in: [t1.id, t2.id] } } });
    expect(tables.map((t) => t.status)).toEqual(["SEATED", "SEATED"]);

    await host.patch(`/api/reservations/${r.id}`, { status: "COMPLETED" });
    tables = await prisma.restaurantTable.findMany({ where: { id: { in: [t1.id, t2.id] } } });
    expect(tables.map((t) => t.status)).toEqual(["NEEDS_CLEANING", "NEEDS_CLEANING"]);
  });

  it("buses a table whose party had already ordered", async () => {
    const { host, r, t1 } = await seatedOnCombo();
    await host.patch(`/api/reservations/${r.id}`, { status: "SEATED" });
    await host.patch(`/api/tables/${t1.id}/status`, { status: "ORDERED" });
    await host.patch(`/api/reservations/${r.id}`, { status: "COMPLETED" });
    expect((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: t1.id } })).status).toBe("NEEDS_CLEANING");
  });

  it("cancelling a seated party frees the table", async () => {
    const { host, r, t1 } = await seatedOnCombo();
    await host.patch(`/api/reservations/${r.id}`, { status: "SEATED" });
    await host.patch(`/api/reservations/${r.id}`, { status: "CANCELLED" });
    expect((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: t1.id } })).status).toBe("NEEDS_CLEANING");
  });

  it("re-saving a completed reservation doesn't reset its turn-time timestamps", async () => {
    const { host, r } = await seatedOnCombo();
    await host.patch(`/api/reservations/${r.id}`, { status: "SEATED" });
    const done = await host.patch(`/api/reservations/${r.id}`, { status: "COMPLETED" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The edit form always re-sends status along with whatever changed.
    const resaved = await host.patch(`/api/reservations/${r.id}`, { status: "COMPLETED", generalNote: "Loved the tasting menu" });
    expect(resaved.body.completedAt).toBe(done.body.completedAt);
    expect(resaved.body.seatedAt).toBe(done.body.seatedAt);
    const guest = await prisma.guest.findUniqueOrThrow({ where: { id: r.guestId } });
    expect(guest.visitCount).toBe(1);
  });

  it("undoing a completion takes the visit back", async () => {
    const { host, r } = await seatedOnCombo();
    await host.patch(`/api/reservations/${r.id}`, { status: "SEATED" });
    await host.patch(`/api/reservations/${r.id}`, { status: "COMPLETED" });
    await host.patch(`/api/reservations/${r.id}`, { status: "SEATED" });
    expect((await prisma.guest.findUniqueOrThrow({ where: { id: r.guestId } })).visitCount).toBe(0);
  });

  it("reinstating a cancelled reservation re-checks its table", async () => {
    const host = await as("HOST");
    const table = await makeTable(2);
    const first = await book(host, { dateTime: at(19).toISOString(), tableId: table.id });
    await host.patch(`/api/reservations/${first.body.id}`, { status: "CANCELLED" });
    await book(host, { dateTime: at(19).toISOString(), tableId: table.id });
    const reinstate = await host.patch(`/api/reservations/${first.body.id}`, { status: "BOOKED" });
    expect(reinstate.status).toBe(409);
  });
});
