import { prisma } from "./prisma";
import { zonedParts } from "./time";

// Resolves which configured Shift a reservation time falls into, so pacing checks (Phase 8) and
// reporting (Phase 9) can group reservations without re-deriving this on every read. Day and
// time-of-day are the restaurant's (lib/time.ts), not the server's.
export async function findShiftForDateTime(dateTime: Date) {
  const { dayOfWeek, minutesOfDay } = zonedParts(dateTime);

  return prisma.shift.findFirst({
    where: { dayOfWeek, startMinutes: { lte: minutesOfDay }, endMinutes: { gt: minutesOfDay } },
  });
}
