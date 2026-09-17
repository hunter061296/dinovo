import type { PacingRule, Reservation, Shift } from "./reservations";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// A cancelled or no-show reservation never occupied a seat, so it shouldn't count against the cap.
const COUNTED_STATUSES = new Set(["BOOKED", "SEATED", "COMPLETED"]);

export function findShiftForSlot(shifts: Shift[], slotMinutes: number): Shift | undefined {
  return shifts.find((s) => slotMinutes >= s.startMinutes && slotMinutes < s.endMinutes);
}

export function findPacingRule(shifts: Shift[], slotMinutes: number): PacingRule | undefined {
  return findShiftForSlot(shifts, slotMinutes)?.pacingRules.find((r) => r.timeSlotMinutes === slotMinutes);
}

export function slotMinutesFor(dateTime: string, slotSize = 30): number {
  const d = new Date(dateTime);
  const minutes = d.getHours() * 60 + d.getMinutes();
  return minutes - (minutes % slotSize);
}

export function coversInSlot(reservations: Reservation[], slotMinutes: number, excludeId?: string): number {
  return reservations
    .filter((r) => r.id !== excludeId && COUNTED_STATUSES.has(r.status) && slotMinutesFor(r.dateTime) === slotMinutes)
    .reduce((sum, r) => sum + r.partySize, 0);
}
