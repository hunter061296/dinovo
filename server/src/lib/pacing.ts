import { ReservationStatus } from "@prisma/client";
import { prisma } from "./prisma";

// A cancelled or no-show reservation never occupied a seat, so it shouldn't count against the cap.
// Mirrors client/src/lib/pacing.ts's COUNTED_STATUSES.
const COUNTED_STATUSES: ReservationStatus[] = ["BOOKED", "SEATED", "COMPLETED"];
const SLOT_MINUTES = 30;

// Mirrors client/src/lib/pacing.ts's slotMinutesFor.
export function slotMinutesFor(dateTime: Date, slotSize = SLOT_MINUTES): number {
  const minutes = dateTime.getHours() * 60 + dateTime.getMinutes();
  return minutes - (minutes % slotSize);
}

export interface CapCheckResult {
  overCap: boolean;
  capDetail: string | null;
}

// Mirrors client/src/lib/pacing.ts's coversInSlot/findPacingRule, scoped server-side by the
// shift already resolved for this dateTime (see lib/shiftMatch.ts) rather than re-deriving it
// from raw minute ranges, so this stays consistent with how pacing/reporting elsewhere resolves
// a reservation's shift.
export async function checkPacingCap(params: {
  dateTime: Date;
  partySize: number;
  shiftId: string | null | undefined;
  excludeId?: string;
  // A party flagged excludeFromPacing doesn't consume the slot's cover cap, so it's skipped from
  // both sides of the covers check — it neither adds to `existingCovers` for other reservations'
  // checks (see the where filter below) nor triggers a covers warning for itself.
  excludeFromPacing?: boolean;
}): Promise<CapCheckResult> {
  const { dateTime, partySize, shiftId, excludeId, excludeFromPacing } = params;
  if (!shiftId) return { overCap: false, capDetail: null };

  const slot = slotMinutesFor(dateTime);
  const rule = await prisma.pacingRule.findFirst({ where: { shiftId, timeSlotMinutes: slot } });
  if (!rule) return { overCap: false, capDetail: null };

  const messages: string[] = [];

  if (!excludeFromPacing) {
    const dayStart = new Date(dateTime);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const sameDayReservations = await prisma.reservation.findMany({
      where: {
        dateTime: { gte: dayStart, lt: dayEnd },
        status: { in: COUNTED_STATUSES },
        excludeFromPacing: false,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { dateTime: true, partySize: true },
    });

    const existingCovers = sameDayReservations
      .filter((r) => slotMinutesFor(r.dateTime) === slot)
      .reduce((sum, r) => sum + r.partySize, 0);

    const projected = existingCovers + partySize;
    if (projected > rule.maxCovers) {
      messages.push(`This slot would have ${projected}/${rule.maxCovers} covers.`);
    }
  }

  if (partySize > rule.maxPartySize) {
    messages.push(`Party size ${partySize} exceeds this slot's max of ${rule.maxPartySize}.`);
  }

  return { overCap: messages.length > 0, capDetail: messages.length > 0 ? messages.join(" ") : null };
}
