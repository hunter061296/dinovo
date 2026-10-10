import { Router } from "express";
import { z } from "zod";
import { WaitlistStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { getIO } from "../lib/socket";
import { estimateWaitMinutes } from "../lib/waitEstimate";
import { findShiftForDateTime } from "../lib/shiftMatch";
import { loadTurnTimes, resolveTurnMinutes } from "../lib/turnTimes";

const router = Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? (req.query.status as WaitlistStatus) : "WAITING";
  const entries = await prisma.waitlistEntry.findMany({
    where: { status },
    include: { seatedTable: true },
    orderBy: { addedAt: "asc" },
  });
  res.json(entries);
});

const createSchema = z.object({
  guestName: z.string().min(1),
  phone: z.string().optional(),
  partySize: z.number().int().positive(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const now = new Date();
  const [tables, waiting, rules, shift, activeBlocks] = await Promise.all([
    prisma.restaurantTable.findMany(),
    prisma.waitlistEntry.findMany({ where: { status: "WAITING" }, orderBy: { addedAt: "asc" } }),
    loadTurnTimes(),
    findShiftForDateTime(now),
    prisma.tableBlock.findMany({ where: { startsAt: { lte: now }, endsAt: { gt: now } } }),
  ]);
  const quotedWaitMinutes = estimateWaitMinutes({
    partySize: parsed.data.partySize,
    tables,
    waitingAhead: waiting,
    turnMinutes: (size) => resolveTurnMinutes(rules, size, shift?.id),
    activeBlocks,
    now,
  });

  const entry = await prisma.waitlistEntry.create({
    data: { ...parsed.data, quotedWaitMinutes },
  });
  getIO().emit("waitlist:created", entry);
  res.status(201).json(entry);
});

const updateSchema = z.object({ status: z.nativeEnum(WaitlistStatus) });

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const entry = await prisma.waitlistEntry.update({ where: { id: req.params.id }, data: parsed.data });
    getIO().emit("waitlist:updated", entry);
    res.json(entry);
  } catch {
    res.status(404).json({ error: "Waitlist entry not found" });
  }
});

const seatSchema = z.object({ tableId: z.string().uuid() });

router.post("/:id/seat", async (req, res) => {
  const parsed = seatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [existing, table] = await Promise.all([
    prisma.waitlistEntry.findUnique({ where: { id: req.params.id } }),
    prisma.restaurantTable.findUnique({ where: { id: parsed.data.tableId } }),
  ]);
  if (!existing) {
    return res.status(404).json({ error: "Waitlist entry not found" });
  }
  if (existing.status !== "WAITING") {
    return res.status(409).json({ error: `${existing.guestName} is no longer waiting` });
  }
  if (!table) {
    return res.status(404).json({ error: "Table not found" });
  }

  const now = new Date();
  const block = await prisma.tableBlock.findFirst({ where: { tableId: table.id, startsAt: { lte: now }, endsAt: { gt: now } } });
  if (block) {
    return res.status(409).json({ error: `Table ${table.number} is blocked right now${block.reason ? ` (${block.reason})` : ""}` });
  }

  // Both writes are conditional on the state just checked, inside one transaction, so two hosts
  // seating at the same moment can't both win the same table (or seat the same party twice).
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.restaurantTable.updateMany({
      where: { id: table.id, status: "OPEN" },
      data: { status: "SEATED", statusUpdatedAt: now },
    });
    if (claimed.count === 0) return { error: `Table ${table.number} is not open` } as const;
    const seated = await tx.waitlistEntry.updateMany({
      where: { id: existing.id, status: "WAITING" },
      data: { status: "SEATED", seatedAt: now, seatedTableId: table.id },
    });
    if (seated.count === 0) throw new SeatConflict(`${existing.guestName} is no longer waiting`);
    const entry = await tx.waitlistEntry.findUniqueOrThrow({ where: { id: existing.id } });
    const updatedTable = await tx.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
    return { entry, updatedTable } as const;
  }).catch((err) => {
    if (err instanceof SeatConflict) return { error: err.message } as const;
    throw err;
  });
  if ("error" in result) {
    return res.status(409).json({ error: result.error });
  }
  const { entry, updatedTable } = result;

  getIO().emit("waitlist:updated", entry);
  getIO().emit("table:updated", updatedTable);
  res.json(entry);
});

// Thrown inside the seat transaction to roll back the table claim when the party was seated
// elsewhere in the meantime.
class SeatConflict extends Error {}

export default router;
