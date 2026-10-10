import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { conflictMessage, findConflict } from "../lib/tableAvailability";
import { ISO_DATE_REGEX, zonedDayBounds } from "../lib/time";

const router = Router();

// Open to every role: holding a table for a VIP or taking one out of service is a host-stand
// call, same as changing a table's status.
router.use(authenticate);

const include = { table: true, createdBy: { select: { id: true, name: true } } };

// Blocks overlapping the restaurant's calendar day `date`.
router.get("/", async (req, res) => {
  const dateParam = typeof req.query.date === "string" ? req.query.date : null;
  if (!dateParam || !ISO_DATE_REGEX.test(dateParam)) {
    return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });
  }
  const { start, end } = zonedDayBounds(dateParam);
  const blocks = await prisma.tableBlock.findMany({
    where: { startsAt: { lt: end }, endsAt: { gt: start } },
    include,
    orderBy: { startsAt: "asc" },
  });
  res.json(blocks);
});

const blockSchema = z.object({
  tableId: z.string().uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().trim().max(200).optional().nullable(),
});

async function validateBlock(data: z.infer<typeof blockSchema>) {
  if (data.endsAt <= data.startsAt) return "Block end must be after its start";
  const table = await prisma.restaurantTable.findUnique({ where: { id: data.tableId } });
  if (!table) return "Table not found";
  // A block can't silently strand a party already booked on that table at that time.
  const conflict = await findConflict({
    tableIds: [data.tableId],
    start: data.startsAt,
    durationMinutes: (data.endsAt.getTime() - data.startsAt.getTime()) / 60_000,
    ignoreBlocks: true,
  });
  if (conflict) return conflictMessage(conflict);
  return null;
}

router.post("/", async (req, res) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const error = await validateBlock(parsed.data);
  if (error) return res.status(error === "Table not found" ? 404 : 409).json({ error });

  const block = await prisma.tableBlock.create({
    data: { ...parsed.data, reason: parsed.data.reason || null, createdById: req.user!.sub },
    include,
  });
  res.status(201).json(block);
});

router.patch("/:id", async (req, res) => {
  const parsed = blockSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const existing = await prisma.tableBlock.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Block not found" });

  const merged = {
    tableId: parsed.data.tableId ?? existing.tableId,
    startsAt: parsed.data.startsAt ?? existing.startsAt,
    endsAt: parsed.data.endsAt ?? existing.endsAt,
    reason: parsed.data.reason !== undefined ? parsed.data.reason : existing.reason,
  };
  const error = await validateBlock(merged);
  if (error) return res.status(error === "Table not found" ? 404 : 409).json({ error });

  const block = await prisma.tableBlock.update({
    where: { id: existing.id },
    data: { ...merged, reason: merged.reason || null },
    include,
  });
  res.json(block);
});

router.delete("/:id", async (req, res) => {
  await prisma.tableBlock.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
