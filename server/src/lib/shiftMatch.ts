import { prisma } from "./prisma";

// Resolves which configured Shift a reservation time falls into, so pacing checks (Phase 8) and
// reporting (Phase 9) can group reservations without re-deriving this on every read.
export async function findShiftForDateTime(dateTime: Date) {
  const dayOfWeek = dateTime.getDay();
  const minutes = dateTime.getHours() * 60 + dateTime.getMinutes();

  return prisma.shift.findFirst({
    where: { dayOfWeek, startMinutes: { lte: minutes }, endMinutes: { gt: minutes } },
  });
}
