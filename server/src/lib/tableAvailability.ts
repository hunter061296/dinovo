import { ReservationStatus } from "@prisma/client";
import { prisma } from "./prisma";

// A table physically can't seat two parties at once. There's no per-table turn-time setting to
// derive this from (PacingRule.timeSlotMinutes is a 30-minute booking-cadence bucket, not how
// long a party actually occupies a table), so assume a flat 90-minute occupancy window around
// each reservation's dateTime — long enough to cover a typical seating through bussing.
export const TABLE_OVERLAP_MINUTES = 90;

// A cancelled/no-show/completed reservation has freed the table, so it can't conflict.
const OCCUPYING_STATUSES: ReservationStatus[] = ["BOOKED", "SEATED"];

export interface TableConflict {
  id: string;
  dateTime: Date;
  guestName: string;
}

function formatTime(d: Date): string {
  const h24 = d.getHours();
  const m = d.getMinutes();
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

export async function findConflictingReservation(params: {
  tableId: string;
  dateTime: Date;
  excludeId?: string;
}): Promise<TableConflict | null> {
  const { tableId, dateTime, excludeId } = params;
  const windowMs = TABLE_OVERLAP_MINUTES * 60 * 1000;

  const conflict = await prisma.reservation.findFirst({
    where: {
      tableId,
      status: { in: OCCUPYING_STATUSES },
      dateTime: { gt: new Date(dateTime.getTime() - windowMs), lt: new Date(dateTime.getTime() + windowMs) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: { guest: true },
    orderBy: { dateTime: "asc" },
  });
  if (!conflict) return null;

  return { id: conflict.id, dateTime: conflict.dateTime, guestName: `${conflict.guest.firstName} ${conflict.guest.lastName}` };
}

export function conflictMessage(conflict: TableConflict): string {
  return `This table is already booked for ${conflict.guestName} at ${formatTime(conflict.dateTime)} — within ${TABLE_OVERLAP_MINUTES} minutes of this reservation.`;
}
