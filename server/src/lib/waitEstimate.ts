import { RestaurantTable, WaitlistEntry } from "@prisma/client";

// MVP heuristic, not a real queueing model: assume every occupied table takes this long to
// turn over. Phase 9 actually measures average turn time from seatedAt/completedAt — once that
// exists, swap this constant for a rolling average for a much better estimate.
const AVG_TURN_MINUTES = 45;

export function estimateWaitMinutes(
  partySize: number,
  tables: RestaurantTable[],
  waitingAhead: WaitlistEntry[]
): number {
  // "Fits" means big enough for the party without being wastefully oversized (allow up to 2 extra
  // seats before considering it a mismatch) — falls back to any table big enough if none fit tightly.
  const tightFit = tables.filter((t) => t.capacity >= partySize && t.capacity <= partySize + 2);
  const candidates = tightFit.length > 0 ? tightFit : tables.filter((t) => t.capacity >= partySize);

  if (candidates.length === 0) {
    // No table in the house can seat this party at all.
    return 90;
  }

  const openNow = candidates.filter((t) => t.status === "OPEN").length;
  if (openNow > 0) {
    return 0;
  }

  // How many other waiting parties would also compete for this same pool of tables.
  const aheadForSamePool = waitingAhead.filter((w) => w.partySize <= candidates[candidates.length - 1].capacity).length;
  const turnsNeeded = Math.ceil((aheadForSamePool + 1) / candidates.length);
  return turnsNeeded * AVG_TURN_MINUTES;
}
