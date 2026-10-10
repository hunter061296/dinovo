import { describe, expect, it } from "vitest";
import { NO_FIT_QUOTE_MINUTES, RESET_MINUTES, estimateWaitMinutes } from "../src/lib/waitEstimate";

const now = new Date("2026-10-10T23:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const table = (id: string, capacity: number, status: "OPEN" | "SEATED" | "ORDERED" | "NEEDS_CLEANING", seatedMinutesAgo = 0) => ({
  id,
  capacity,
  status,
  statusUpdatedAt: minutesAgo(seatedMinutesAgo),
});
const turn = () => 60;

describe("estimateWaitMinutes", () => {
  it("quotes no wait when a fitting table is open and nobody is ahead", () => {
    expect(estimateWaitMinutes({ partySize: 2, tables: [table("a", 2, "OPEN")], waitingAhead: [], turnMinutes: turn, now })).toBe(0);
  });

  it("quotes the remaining turn time of a seated table, not a fixed guess", () => {
    // Seated 40 minutes ago with a 60-minute turn: ~20 left, plus resetting the table.
    const quote = estimateWaitMinutes({ partySize: 2, tables: [table("a", 2, "SEATED", 40)], waitingAhead: [], turnMinutes: turn, now });
    expect(quote).toBe(Math.ceil((20 + RESET_MINUTES) / 5) * 5);
  });

  it("puts parties already waiting ahead in line for the same tables", () => {
    const quote = estimateWaitMinutes({
      partySize: 2,
      tables: [table("a", 2, "OPEN")],
      waitingAhead: [{ partySize: 2 }],
      turnMinutes: turn,
      now,
    });
    // The party ahead takes the open table; this party waits out their whole turn.
    expect(quote).toBe(60 + RESET_MINUTES);
  });

  it("ignores waiting parties too big for this pool of tables", () => {
    const quote = estimateWaitMinutes({
      partySize: 2,
      tables: [table("a", 2, "OPEN"), table("big", 10, "SEATED", 0)],
      waitingAhead: [{ partySize: 8 }],
      turnMinutes: turn,
      now,
    });
    expect(quote).toBe(0);
  });

  it("treats a table that's blocked right now as unavailable until the block ends", () => {
    const quote = estimateWaitMinutes({
      partySize: 2,
      tables: [table("a", 2, "OPEN")],
      waitingAhead: [],
      turnMinutes: turn,
      activeBlocks: [{ tableId: "a", endsAt: new Date(now.getTime() + 30 * 60_000) }],
      now,
    });
    expect(quote).toBe(30);
  });

  it("has a fallback for a party no table can seat", () => {
    expect(estimateWaitMinutes({ partySize: 12, tables: [table("a", 4, "OPEN")], waitingAhead: [], turnMinutes: turn, now })).toBe(
      NO_FIT_QUOTE_MINUTES,
    );
  });
});
