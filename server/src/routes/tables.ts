import { Router } from "express";
import { z } from "zod";
import { TableShape } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// Every role needs to see the floor plan (Hosts use it as the live status board in Phase 5).
router.get("/", async (_req, res) => {
  const tables = await prisma.restaurantTable.findMany({ orderBy: { number: "asc" } });
  res.json(tables);
});

const createTableSchema = z.object({
  number: z.number().int().positive(),
  capacity: z.number().int().positive(),
  shape: z.nativeEnum(TableShape),
  positionX: z.number().default(20),
  positionY: z.number().default(20),
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
  res.status(201).json(table);
});

const updateTableSchema = z.object({
  number: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  shape: z.nativeEnum(TableShape).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
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
    res.json(table);
  } catch {
    res.status(404).json({ error: "Table not found" });
  }
});

router.delete("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    await prisma.restaurantTable.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Table not found" });
  }
});

export default router;
