import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { DEFAULT_TURN_MINUTES } from "../lib/turnTimes";
import { MAX_DURATION_MINUTES } from "../lib/tableAvailability";

const router = Router();

router.use(authenticate);

// Read for every role — the reservation book shows each party's expected table time.
router.get("/", async (_req, res) => {
  const rules = await prisma.turnTime.findMany({ orderBy: [{ shiftId: "asc" }, { maxPartySize: "asc" }] });
  res.json({ defaultMinutes: DEFAULT_TURN_MINUTES, rules });
});

const replaceSchema = z.object({
  // null = the house defaults; a shift id = that shift's overrides.
  shiftId: z.string().uuid().nullable(),
  rules: z
    .array(
      z.object({
        maxPartySize: z.number().int().positive(),
        minutes: z.number().int().min(15).max(MAX_DURATION_MINUTES),
      }),
    )
    .refine((rules) => new Set(rules.map((r) => r.maxPartySize)).size === rules.length, {
      message: "Each party-size bracket can only appear once",
    }),
});

// Replaces the whole bracket set for one scope at once — the editor works on the full table of
// brackets, so there's no per-row create/update bookkeeping. An empty list removes a shift's
// overrides (it falls back to the house defaults).
router.put("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = replaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { shiftId, rules } = parsed.data;
  if (shiftId) {
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "Shift not found" });
  }

  const saved = await prisma.$transaction(async (tx) => {
    await tx.turnTime.deleteMany({ where: { shiftId } });
    await tx.turnTime.createMany({ data: rules.map((r) => ({ ...r, shiftId })) });
    return tx.turnTime.findMany({ where: { shiftId }, orderBy: { maxPartySize: "asc" } });
  });
  res.json(saved);
});

export default router;
