import { Router } from "express";
import { z } from "zod";
import { TableShape, TableStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { getIO } from "../lib/socket";

const router = Router();

router.use(authenticate);

// Every role needs to see the floor plan (it doubles as the live status board — Phase 5).
router.get("/", async (_req, res) => {
  const tables = await prisma.restaurantTable.findMany({ orderBy: { number: "asc" } });
  res.json(tables);
});

// Powers the "Currently Seated" panel. A seated table's occupant might be a reservation, a
// waitlist walk-in, or (if a host just clicked "Seated" directly) neither — best-effort name
// lookup, falling back to null rather than guessing.
router.get("/seated-summary", async (_req, res) => {
  const tables = await prisma.restaurantTable.findMany({
    where: { status: "SEATED" },
    orderBy: { statusUpdatedAt: "asc" },
  });
  if (tables.length === 0) {
    return res.json([]);
  }

  const tableIds = tables.map((t) => t.id);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [reservations, waitlistEntries] = await Promise.all([
    prisma.reservation.findMany({
      where: { tableId: { in: tableIds }, status: "SEATED", dateTime: { gte: todayStart, lt: todayEnd } },
      include: { guest: true },
    }),
    prisma.waitlistEntry.findMany({
      where: { seatedTableId: { in: tableIds }, status: "SEATED" },
    }),
  ]);

  const summary = tables.map((t) => {
    const reservation = reservations.find((r) => r.tableId === t.id);
    const waitlistEntry = waitlistEntries.find((w) => w.seatedTableId === t.id);
    return {
      tableId: t.id,
      tableNumber: t.number,
      capacity: t.capacity,
      statusUpdatedAt: t.statusUpdatedAt,
      guestName: reservation ? `${reservation.guest.firstName} ${reservation.guest.lastName}` : (waitlistEntry?.guestName ?? null),
      partySize: reservation?.partySize ?? waitlistEntry?.partySize ?? null,
    };
  });

  res.json(summary);
});

const createTableSchema = z.object({
  number: z.number().int().positive(),
  capacity: z.number().int().positive(),
  shape: z.nativeEnum(TableShape),
  positionX: z.number().default(20),
  positionY: z.number().default(20),
  sectionId: z.string().uuid().nullable().optional(),
});

router.post("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = createTableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const existing = await prisma.restaurantTable.findUnique({ where: { number: parsed.data.number } });
  if (existing) {
    return res.status(409).json({ error: `Table ${parsed.data.number} already exists` });
  }

  const table = await prisma.restaurantTable.create({ data: parsed.data });
  getIO().emit("table:created", table);
  res.status(201).json(table);
});

const updateTableSchema = z.object({
  number: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  shape: z.nativeEnum(TableShape).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  sectionId: z.string().uuid().nullable().optional(),
});

router.patch("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = updateTableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  if (parsed.data.number !== undefined) {
    const existing = await prisma.restaurantTable.findUnique({ where: { number: parsed.data.number } });
    if (existing && existing.id !== req.params.id) {
      return res.status(409).json({ error: `Table ${parsed.data.number} already exists` });
    }
  }

  try {
    const table = await prisma.restaurantTable.update({ where: { id: req.params.id }, data: parsed.data });
    getIO().emit("table:updated", table);
    res.json(table);
  } catch {
    res.status(404).json({ error: "Table not found" });
  }
});

// Open to every role (unlike layout edits above) — a Host needs one-click status changes
// at the stand without Manager/Admin permissions.
const updateStatusSchema = z.object({ status: z.nativeEnum(TableStatus) });

router.patch("/:id/status", async (req, res) => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const table = await prisma.restaurantTable.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status, statusUpdatedAt: new Date() },
    });
    getIO().emit("table:updated", table);
    res.json(table);
  } catch {
    res.status(404).json({ error: "Table not found" });
  }
});

// Stub — see NOTES.md. No real SMS/email provider is wired up for this MVP.
router.post("/:id/notify", async (req, res) => {
  const table = await prisma.restaurantTable.findUnique({ where: { id: req.params.id } });
  if (!table) {
    return res.status(404).json({ error: "Table not found" });
  }
  res.json({ success: true, message: `(stub) Guest for table ${table.number} would be notified here.` });
});

router.delete("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    await prisma.restaurantTable.delete({ where: { id: req.params.id } });
    getIO().emit("table:deleted", { id: req.params.id });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Table not found" });
  }
});

export default router;
