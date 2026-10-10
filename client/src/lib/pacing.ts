import type { PacingRule, Reservation, Shift } from "./reservations";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// A cancelled or no-show reservation never occupied a seat, so it shouldn't count against the cap.
const COUNTED_STATUSES = new Set(["BOOKED", "SEATED", "COMPLETED"]);

// Day of week (0 = Sunday, matching Shift.dayOfWeek) of a YYYY-MM-DD date.
export function dayOfWeekFor(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00`).getDay();
}

// Shifts recur weekly, so a slot only belongs to a shift on that shift's own weekday — the
// dayOfWeek is required so a caller can't accidentally pick up another day's pacing caps.
export function findShiftForSlot(shifts: Shift[], slotMinutes: number, dayOfWeek: number): Shift | undefined {
  return shifts.find((s) => s.dayOfWeek === dayOfWeek && slotMinutes >= s.startMinutes && slotMinutes < s.endMinutes);
}

export function findPacingRule(shifts: Shift[], slotMinutes: number, dayOfWeek: number): PacingRule | undefined {
  return findShiftForSlot(shifts, slotMinutes, dayOfWeek)?.pacingRules.find((r) => r.timeSlotMinutes === slotMinutes);
}

export function slotMinutesFor(dateTime: string, slotSize = 30): number {
  const d = new Date(dateTime);
  const minutes = d.getHours() * 60 + d.getMinutes();
  return minutes - (minutes % slotSize);
}

export function coversInSlot(reservations: Reservation[], slotMinutes: number, excludeId?: string): number {
  return reservations
    .filter(
      (r) =>
        r.id !== excludeId &&
        !r.excludeFromPacing &&
        COUNTED_STATUSES.has(r.status) &&
        slotMinutesFor(r.dateTime) === slotMinutes
    )
    .reduce((sum, r) => sum + r.partySize, 0);
}
