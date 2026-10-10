import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

const include = { tables: { orderBy: { number: "asc" as const } } };

// Read for every role — hosts pick combinations when assigning a large party.
router.get("/", async (_req, res) => {
  const combinations = await prisma.tableCombination.findMany({ include });
  combinations.sort((a, b) => a.tables[0]?.number - b.tables[0]?.number || a.tables.length - b.tables.length);
  res.json(combinations);
});

const combinationSchema = z.object({
  tableIds: z.array(z.string().uuid()).min(2, "A combination needs at least two tables"),
  // Defaults to the members' combined seats; pushing tables together often loses a seat or two.
  capacity: z.number().int().positive().optional(),
});

async function validateTables(tableIds: string[], excludeId?: string) {
  const unique = [...new Set(tableIds)];
  if (unique.length !== tableIds.length) return { error: "A table can only appear once in a combination" } as const;
  const tables = await prisma.restaurantTable.findMany({ where: { id: { in: unique } } });
  if (tables.length !== unique.length) return { error: "One or more tables don't exist" } as const;

  const sameSet = await prisma.tableCombination.findMany({ include: { tables: { select: { id: true } } } });
  const key = [...unique].sort().join(",");
  const dupe = sameSet.find((c) => c.id !== excludeId && c.tables.map((t) => t.id).sort().join(",") === key);
  if (dupe) return { error: "That combination already exists" } as const;
  return { tables } as const;
}

router.post("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = combinationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const check = await validateTables(parsed.data.tableIds);
  if ("error" in check) return res.status(400).json({ error: check.error });

  const combination = await prisma.tableCombination.create({
    data: {
      capacity: parsed.data.capacity ?? check.tables.reduce((sum, t) => sum + t.capacity, 0),
      tables: { connect: parsed.data.tableIds.map((id) => ({ id })) },
    },
    include,
  });
  res.status(201).json(combination);
});

router.patch("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = combinationSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const existing = await prisma.tableCombination.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Combination not found" });

  if (parsed.data.tableIds) {
    const check = await validateTables(parsed.data.tableIds, existing.id);
    if ("error" in check) return res.status(400).json({ error: check.error });
  }
  const combination = await prisma.tableCombination.update({
    where: { id: existing.id },
    data: {
      capacity: parsed.data.capacity,
      ...(parsed.data.tableIds ? { tables: { set: parsed.data.tableIds.map((id) => ({ id })) } } : {}),
    },
    include,
  });
  res.json(combination);
});

// Reservations booked on a deleted combination keep their primary table (schema onDelete:
// SetNull on combinationId), so nothing on the book disappears.
router.delete("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  await prisma.tableCombination.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
