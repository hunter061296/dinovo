import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// Read-only for now — the Reservation Book needs shift hours to size its day-view timeline.
// Phase 8 adds the Manager/Admin config UI (create/edit shifts + pacing rules).
router.get("/", async (_req, res) => {
  const shifts = await prisma.shift.findMany({ orderBy: { startMinutes: "asc" } });
  res.json(shifts);
});

export default router;
