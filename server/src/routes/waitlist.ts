import { Router } from "express";
import { z } from "zod";
import { WaitlistStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { getIO } from "../lib/socket";
import { estimateWaitMinutes } from "../lib/waitEstimate";

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

  const [tables, waiting] = await Promise.all([
    prisma.restaurantTable.findMany(),
    prisma.waitlistEntry.findMany({ where: { status: "WAITING" }, orderBy: { addedAt: "asc" } }),
  ]);
  const quotedWaitMinutes = estimateWaitMinutes(parsed.data.partySize, tables, waiting);

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

  const table = await prisma.restaurantTable.findUnique({ where: { id: parsed.data.tableId } });
  if (!table) {
    return res.status(404).json({ error: "Table not found" });
  }
  if (table.status !== "OPEN") {
    return res.status(409).json({ error: `Table ${table.number} is not open` });
  }

  const [entry, updatedTable] = await prisma.$transaction([
    prisma.waitlistEntry.update({
      where: { id: req.params.id },
      data: { status: "SEATED", seatedAt: new Date(), seatedTableId: table.id },
    }),
    prisma.restaurantTable.update({ where: { id: table.id }, data: { status: "SEATED", statusUpdatedAt: new Date() } }),
  ]);

  getIO().emit("waitlist:updated", entry);
  getIO().emit("table:updated", updatedTable);
  res.json(entry);
});

export default router;
