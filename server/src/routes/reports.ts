import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { computeReportSummary, computeShiftOverview } from "../lib/reportMetrics";
import { ISO_DATE_REGEX, addDaysToISODate, dayOfWeekForISODate, todayISODate, zonedDateTime } from "../lib/time";

const router = Router();

router.use(authenticate, authorize("ADMIN", "MANAGER"));

// "Today" and "this week" are the restaurant's calendar days (lib/time.ts), not the server's.
function rangeBounds(range: string): { start: Date; end: Date } {
  const today = todayISODate();

  if (range === "week") {
    // Sunday-through-Saturday, matching the dayOfWeek convention Shifts already use. Includes
    // the rest of the week's already-booked future reservations, not just up to "now".
    const weekStart = addDaysToISODate(today, -dayOfWeekForISODate(today));
    return { start: zonedDateTime(weekStart, 0), end: zonedDateTime(addDaysToISODate(weekStart, 7), 0) };
  }

  return { start: zonedDateTime(today, 0), end: zonedDateTime(addDaysToISODate(today, 1), 0) };
}

router.get("/summary", async (req, res) => {
  const range = req.query.range === "week" ? "week" : "today";
  const { start, end } = rangeBounds(range);

  const reservations = await prisma.reservation.findMany({
    where: { dateTime: { gte: start, lt: end } },
  });

  res.json(computeReportSummary(reservations));
});

router.get("/shift-overview", async (req, res) => {
  const shiftId = typeof req.query.shiftId === "string" ? req.query.shiftId : null;
  const dateParam = typeof req.query.date === "string" ? req.query.date : null;
  if (!shiftId || !dateParam || !ISO_DATE_REGEX.test(dateParam)) {
    return res.status(400).json({ error: "shiftId and date (YYYY-MM-DD) query params are required" });
  }

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found" });
  }

  if (dayOfWeekForISODate(dateParam) !== shift.dayOfWeek) {
    return res.status(400).json({ error: "The selected date doesn't fall on this shift's day of week" });
  }

  res.json(await computeShiftOverview(shift, dateParam));
});

export default router;
