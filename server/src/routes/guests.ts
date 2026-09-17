import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// Used by the reservation form's guest search-or-create step. Full guestbook (tags, notes,
// visit history) lands in Phase 7 — this is deliberately minimal.
router.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (!search) {
    return res.json([]);
  }
  const guests = await prisma.guest.findMany({
    where: {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    },
    orderBy: { lastName: "asc" },
    take: 10,
  });
  res.json(guests);
});

const createGuestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

router.post("/", async (req, res) => {
  const parsed = createGuestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { firstName, lastName, phone, email } = parsed.data;
  const guest = await prisma.guest.create({
    data: { firstName, lastName, phone: phone || null, email: email || null },
  });
  res.status(201).json(guest);
});

export default router;
