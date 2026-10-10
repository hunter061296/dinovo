import { describe, expect, it } from "vitest";
import { planStatusTransition } from "../src/lib/reservationStatus";

const now = new Date("2026-10-10T23:00:00Z");
const earlier = new Date("2026-10-10T22:00:00Z");

describe("planStatusTransition", () => {
  it("does nothing when the status isn't changing (re-saving a form)", () => {
    expect(planStatusTransition("COMPLETED", "COMPLETED", { seatedAt: earlier }, now)).toEqual({
      counterDeltas: [],
      timestamps: {},
      tableAction: null,
    });
  });

  it("seats: starts the clock and occupies the table", () => {
    const plan = planStatusTransition("BOOKED", "SEATED", { seatedAt: null }, now);
    expect(plan.timestamps).toEqual({ seatedAt: now, completedAt: null });
    expect(plan.tableAction).toBe("seat");
    expect(plan.counterDeltas).toEqual([]);
  });

  it("completes: counts the visit and buses the table", () => {
    const plan = planStatusTransition("SEATED", "COMPLETED", { seatedAt: earlier }, now);
    expect(plan.counterDeltas).toEqual([{ field: "visitCount", delta: 1 }]);
    expect(plan.timestamps).toEqual({ completedAt: now });
    expect(plan.tableAction).toBe("bus");
  });

  it("cancelling a party that was already seated still frees their table", () => {
    const plan = planStatusTransition("SEATED", "CANCELLED", { seatedAt: earlier }, now);
    expect(plan.tableAction).toBe("bus");
    expect(plan.counterDeltas).toEqual([{ field: "cancellationCount", delta: 1 }]);
  });

  it("undoing a completion takes the visit back and keeps the original seating time", () => {
    const plan = planStatusTransition("COMPLETED", "SEATED", { seatedAt: earlier }, now);
    expect(plan.counterDeltas).toEqual([{ field: "visitCount", delta: -1 }]);
    expect(plan.timestamps).toEqual({ seatedAt: earlier, completedAt: null });
  });

  it("undoing a seating releases the table", () => {
    const plan = planStatusTransition("SEATED", "BOOKED", { seatedAt: earlier }, now);
    expect(plan.tableAction).toBe("release");
    expect(plan.timestamps).toEqual({ seatedAt: null, completedAt: null });
  });

  it("swaps counters when correcting one outcome to another", () => {
    const plan = planStatusTransition("NO_SHOW", "CANCELLED", { seatedAt: null }, now);
    expect(plan.counterDeltas).toEqual([
      { field: "noShowCount", delta: -1 },
      { field: "cancellationCount", delta: 1 },
    ]);
    expect(plan.tableAction).toBeNull();
  });
});
