import type { TurnTime } from "@prisma/client";
import { prisma } from "./prisma";

// Used when no TurnTime rules are configured at all — the same flat 90 minutes the table
// double-booking check assumed before turn times existed.
export const DEFAULT_TURN_MINUTES = 90;

export type TurnTimeRule = Pick<TurnTime, "shiftId" | "maxPartySize" | "minutes">;

// How long a party of `partySize` holds a table during `shiftId`. A shift with any rules of its
// own uses only those; otherwise the house defaults (shiftId null). Within the chosen set, the
// smallest bracket that fits the party wins; a party larger than every bracket gets the largest.
export function resolveTurnMinutes(rules: TurnTimeRule[], partySize: number, shiftId: string | null | undefined): number {
  const shiftRules = shiftId ? rules.filter((r) => r.shiftId === shiftId) : [];
  const applicable = shiftRules.length > 0 ? shiftRules : rules.filter((r) => r.shiftId === null);
  if (applicable.length === 0) return DEFAULT_TURN_MINUTES;

  const sorted = [...applicable].sort((a, b) => a.maxPartySize - b.maxPartySize);
  return (sorted.find((r) => r.maxPartySize >= partySize) ?? sorted[sorted.length - 1]).minutes;
}

// The longest any party can hold a table under the current rules — bounds how far back the
// conflict check has to look for a reservation that might still be occupying a table.
export function maxTurnMinutes(rules: TurnTimeRule[]): number {
  return Math.max(DEFAULT_TURN_MINUTES, ...rules.map((r) => r.minutes));
}

// A reservation's own override (set by resizing it on the grid view) beats the rule lookup.
export function reservationDuration(
  rules: TurnTimeRule[],
  r: { partySize: number; shiftId: string | null; durationMinutes: number | null },
): number {
  return r.durationMinutes ?? resolveTurnMinutes(rules, r.partySize, r.shiftId);
}

// The rule set is tiny (a handful of brackets per shift), so it's loaded whole rather than queried
// per lookup.
export function loadTurnTimes(): Promise<TurnTimeRule[]> {
  return prisma.turnTime.findMany({ select: { shiftId: true, maxPartySize: true, minutes: true } });
}
