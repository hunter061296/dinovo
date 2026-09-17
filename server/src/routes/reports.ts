import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { computeReportSummary } from "../lib/reportMetrics";

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

export default router;
