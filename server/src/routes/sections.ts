import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// Read for every role — the floor plan's section selector needs this regardless of who's viewing.
router.get("/", async (_req, res) => {
  const sections = await prisma.section.findMany({ orderBy: { position: "asc" } });
  res.json(sections);
});

const sectionSchema = z.object({
  name: z.string().min(1),
  position: z.number().int().optional(),
});

router.post("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = sectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const existing = await prisma.section.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    return res.status(409).json({ error: `A section named "${parsed.data.name}" already exists` });
  }
  if (parsed.data.position === undefined) {
    const count = await prisma.section.count();
    parsed.data.position = count;
  }
  const section = await prisma.section.create({ data: parsed.data as { name: string; position: number } });
  res.status(201).json(section);
});

const updateSectionSchema = sectionSchema.partial();

router.patch("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = updateSectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const section = await prisma.section.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(section);
  } catch {
    res.status(404).json({ error: "Section not found" });
  }
});

router.delete("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    // Tables in this section fall back to "no section" (schema onDelete: SetNull) rather than
    // being deleted — removing a section should never take tables with it.
    await prisma.section.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Section not found" });
  }
});

export default router;
