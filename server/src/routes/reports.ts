import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { computeReportSummary, computeShiftOverview } from "../lib/reportMetrics";

const router = Router();

router.use(authenticate, authorize("ADMIN", "MANAGER"));

function rangeBounds(range: string): { start: Date; end: Date } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === "week") {
    // Sunday-through-Saturday, matching the dayOfWeek convention Shifts already use. Includes
    // the rest of the week's already-booked future reservations, not just up to "now".
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  const end = new Date(startOfToday);
  end.setDate(end.getDate() + 1);
  return { start: startOfToday, end };
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
  if (!shiftId || !dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return res.status(400).json({ error: "shiftId and date (YYYY-MM-DD) query params are required" });
  }

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found" });
  }

  const date = new Date(`${dateParam}T00:00:00`);
  if (date.getDay() !== shift.dayOfWeek) {
    return res.status(400).json({ error: "The selected date doesn't fall on this shift's day of week" });
  }

  res.json(await computeShiftOverview(shift, date));
});

export default router;
