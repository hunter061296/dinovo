import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// Read for every role — the Reservation Book uses shift hours + pacing rules to size its
// day-view timeline and show cap warnings. Only Manager/Admin can change the config below.
router.get("/", async (_req, res) => {
  const shifts = await prisma.shift.findMany({
    include: { pacingRules: { orderBy: { timeSlotMinutes: "asc" } } },
    orderBy: { startMinutes: "asc" },
  });
  res.json(shifts);
});

const shiftSchema = z.object({
  name: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startMinutes: z.number().int().min(0).max(1440),
  endMinutes: z.number().int().min(0).max(1440),
});

router.post("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = shiftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  if (parsed.data.endMinutes <= parsed.data.startMinutes) {
    return res.status(400).json({ error: "End time must be after start time" });
  }
  const shift = await prisma.shift.create({ data: parsed.data, include: { pacingRules: true } });
  res.status(201).json(shift);
});

const updateShiftSchema = shiftSchema.partial();

router.patch("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = updateShiftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { pacingRules: { orderBy: { timeSlotMinutes: "asc" } } },
    });
    res.json(shift);
  } catch {
    res.status(404).json({ error: "Shift not found" });
  }
});

router.delete("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    await prisma.shift.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Shift not found" });
  }
});

const pacingRuleSchema = z.object({
  maxCovers: z.number().int().positive(),
  maxPartySize: z.number().int().positive(),
});

// Upsert by (shiftId, timeSlotMinutes) — editing a slot's cap is naturally idempotent, so the
// config UI doesn't need to track whether a rule already exists for that slot.
router.put("/:id/pacing-rules/:timeSlotMinutes", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = pacingRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const timeSlotMinutes = Number(req.params.timeSlotMinutes);
  if (!Number.isInteger(timeSlotMinutes)) {
    return res.status(400).json({ error: "Invalid time slot" });
  }

  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found" });
  }

  const rule = await prisma.pacingRule.upsert({
    where: { shiftId_timeSlotMinutes: { shiftId: shift.id, timeSlotMinutes } },
    create: { shiftId: shift.id, timeSlotMinutes, ...parsed.data },
    update: parsed.data,
  });
  res.json(rule);
});

router.delete("/:id/pacing-rules/:timeSlotMinutes", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const timeSlotMinutes = Number(req.params.timeSlotMinutes);
  try {
    await prisma.pacingRule.delete({
      where: { shiftId_timeSlotMinutes: { shiftId: req.params.id, timeSlotMinutes } },
    });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Pacing rule not found" });
  }
});

export default router;
