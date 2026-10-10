import { RestaurantTable, WaitlistEntry } from "@prisma/client";

// Allowance for bussing and resetting a table between parties.
export const RESET_MINUTES = 5;
// Quoted when no table in the house can seat the party at all.
export const NO_FIT_QUOTE_MINUTES = 90;

export interface WaitEstimateInput {
  partySize: number;
  tables: Pick<RestaurantTable, "id" | "capacity" | "status" | "statusUpdatedAt">[];
  // Parties already waiting, in queue order.
  waitingAhead: Pick<WaitlistEntry, "partySize">[];
  // Turn time for a party of this size in the current shift (lib/turnTimes.ts).
  turnMinutes: (partySize: number) => number;
  // Blocks covering `now` — a blocked table isn't free until its block ends.
  activeBlocks?: { tableId: string; endsAt: Date }[];
  now?: Date;
}

// A small simulation, not a fixed guess: estimate when each suitable table frees up (an occupied
// table's turn time minus how long it's already been occupied), let every party already waiting
// claim the earliest free table in turn, and quote when the next one frees after that. Rounded up
// to 5 minutes, since that's how hosts quote.
export function estimateWaitMinutes({
  partySize,
  tables,
  waitingAhead,
  turnMinutes,
  activeBlocks = [],
  now = new Date(),
}: WaitEstimateInput): number {
  // "Fits" means big enough for the party without being wastefully oversized (allow up to 2 extra
  // seats before considering it a mismatch) — falls back to any table big enough if none fit tightly.
  const tightFit = tables.filter((t) => t.capacity >= partySize && t.capacity <= partySize + 2);
  const candidates = tightFit.length > 0 ? tightFit : tables.filter((t) => t.capacity >= partySize);
  if (candidates.length === 0) return NO_FIT_QUOTE_MINUTES;

  const minutesSince = (d: Date) => Math.max(0, (now.getTime() - d.getTime()) / 60_000);
  const freeAt = candidates.map((t) => {
    let free: number;
    if (t.status === "OPEN") free = 0;
    else if (t.status === "NEEDS_CLEANING") free = RESET_MINUTES;
    // Seated/Ordered: the seated party's size isn't tracked on the table, so its capacity stands in.
    else free = Math.max(0, turnMinutes(t.capacity) - minutesSince(t.statusUpdatedAt)) + RESET_MINUTES;

    const block = activeBlocks.find((b) => b.tableId === t.id);
    if (block) free = Math.max(free, (block.endsAt.getTime() - now.getTime()) / 60_000);
    return free;
  });

  // Only parties that could use this same pool of tables compete with this one.
  const largest = Math.max(...candidates.map((t) => t.capacity));
  for (const ahead of waitingAhead.filter((w) => w.partySize <= largest)) {
    const i = freeAt.indexOf(Math.min(...freeAt));
    freeAt[i] += turnMinutes(ahead.partySize) + RESET_MINUTES;
  }

  const wait = Math.min(...freeAt);
  return Math.ceil(wait / 5) * 5;
}
