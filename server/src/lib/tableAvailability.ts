import { ReservationStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { formatZonedTime } from "./time";
import { loadTurnTimes, maxTurnMinutes, reservationDuration } from "./turnTimes";

// A table physically can't seat two parties at once. Each reservation holds its table(s) for
// [dateTime, dateTime + duration), where duration is the reservation's own override or the
// TurnTime rule for its party size and shift (lib/turnTimes.ts). Table blocks hold a table for
// their own [startsAt, endsAt).

// A cancelled/no-show/completed reservation has freed the table, so it can't conflict.
const OCCUPYING_STATUSES: ReservationStatus[] = ["BOOKED", "SEATED"];

const MINUTE_MS = 60_000;

// Upper bound on a host's per-reservation duration override (validated in the reservations
// route), so the conflict lookback below covers overridden reservations too.
export const MAX_DURATION_MINUTES = 8 * 60;

// Every table a reservation occupies: all members of its combination, or just its table.
export function occupiedTableIds(r: { tableId: string | null; combination?: { tables: { id: string }[] } | null }): string[] {
  if (r.combination) return r.combination.tables.map((t) => t.id);
  return r.tableId ? [r.tableId] : [];
}

export type TableConflict =
  | { kind: "reservation"; id: string; dateTime: Date; guestName: string; tableNumber: number }
  | { kind: "block"; id: string; startsAt: Date; endsAt: Date; reason: string | null; tableNumber: number };

export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function findConflict(params: {
  tableIds: string[];
  start: Date;
  durationMinutes: number;
  excludeReservationId?: string;
  // Skips the block check entirely — used when creating a block, where overlapping another
  // block is harmless (both just say "not available").
  ignoreBlocks?: boolean;
}): Promise<TableConflict | null> {
  const { tableIds, start, durationMinutes, excludeReservationId, ignoreBlocks } = params;
  if (tableIds.length === 0) return null;

  const startMs = start.getTime();
  const endMs = startMs + durationMinutes * MINUTE_MS;
  const rules = await loadTurnTimes();
  // A reservation that started up to the longest possible hold ago could still be at the table.
  const lookbackMs = Math.max(maxTurnMinutes(rules), MAX_DURATION_MINUTES) * MINUTE_MS;

  const [candidates, blocks] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        status: { in: OCCUPYING_STATUSES },
        dateTime: { gt: new Date(startMs - lookbackMs), lt: new Date(endMs) },
        OR: [{ tableId: { in: tableIds } }, { combination: { tables: { some: { id: { in: tableIds } } } } }],
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      include: { guest: true, table: true, combination: { include: { tables: true } } },
      orderBy: { dateTime: "asc" },
    }),
    ignoreBlocks
      ? Promise.resolve([])
      : prisma.tableBlock.findMany({
          where: { tableId: { in: tableIds }, startsAt: { lt: new Date(endMs) }, endsAt: { gt: start } },
          include: { table: true },
          orderBy: { startsAt: "asc" },
        }),
  ]);

  for (const r of candidates) {
    const rStart = r.dateTime.getTime();
    const rEnd = rStart + reservationDuration(rules, r) * MINUTE_MS;
    if (!intervalsOverlap(startMs, endMs, rStart, rEnd)) continue;
    // Name the table actually shared, which for a combination may not be its primary table.
    const shared = r.combination?.tables.find((t) => tableIds.includes(t.id)) ?? r.table;
    return {
      kind: "reservation",
      id: r.id,
      dateTime: r.dateTime,
      guestName: `${r.guest.firstName} ${r.guest.lastName}`,
      tableNumber: shared?.number ?? 0,
    };
  }

  const block = blocks[0];
  if (block) {
    return {
      kind: "block",
      id: block.id,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      reason: block.reason,
      tableNumber: block.table.number,
    };
  }
  return null;
}

export function conflictMessage(conflict: TableConflict): string {
  if (conflict.kind === "block") {
    const why = conflict.reason ? ` (${conflict.reason})` : "";
    return `Table ${conflict.tableNumber} is blocked ${formatZonedTime(conflict.startsAt)} – ${formatZonedTime(conflict.endsAt)}${why}.`;
  }
  return `Table ${conflict.tableNumber} is already booked for ${conflict.guestName} at ${formatZonedTime(conflict.dateTime)}, and the two parties' table times overlap.`;
}
