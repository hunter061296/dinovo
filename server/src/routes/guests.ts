import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// Include just the most recent reservation so list views can show "last visit" without a
// second round trip per guest.
const withLastReservation = {
  reservations: { orderBy: { dateTime: "desc" as const }, take: 1 },
};

// Used both by the reservation form's guest search-or-create step and the Guestbook directory
// (browsing with no search term returns everyone, most recently added first).
router.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const guests = await prisma.guest.findMany({
    where: search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: withLastReservation,
    orderBy: search ? { lastName: "asc" } : { createdAt: "desc" },
    take: search ? 10 : 100,
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

router.get("/:id", async (req, res) => {
  const guest = await prisma.guest.findUnique({
    where: { id: req.params.id },
    include: {
      reservations: {
        include: { table: true },
        orderBy: { dateTime: "desc" },
      },
    },
  });
  if (!guest) {
    return res.status(404).json({ error: "Guest not found" });
  }
  res.json(guest);
});

// Month/day only — deliberately no year, since a birthday/anniversary reminder recurs every year.
const MMDD_REGEX = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const updateGuestSchema = z.object({
  tags: z.array(z.string().min(1)).optional(),
  notes: z.string().optional(),
  specialOccasion: z.string().trim().max(100).nullable().optional(),
  specialOccasionDate: z.string().regex(MMDD_REGEX, "specialOccasionDate must be MM-DD").nullable().optional(),
});

// Open to every role — Hosts and Managers both maintain the guestbook per the product brief.
router.patch("/:id", async (req, res) => {
  const parsed = updateGuestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const guest = await prisma.guest.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(guest);
  } catch {
    res.status(404).json({ error: "Guest not found" });
  }
});

export default router;
