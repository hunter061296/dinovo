import { Router } from "express";
import { z } from "zod";
import { ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { findShiftForDateTime } from "../lib/shiftMatch";
import { checkPacingCap } from "../lib/pacing";
import { findConflictingReservation, conflictMessage } from "../lib/tableAvailability";
import { getIO } from "../lib/socket";

const router = Router();

router.use(authenticate);

const include = { guest: true, table: true, shift: true } as const;

router.get("/", async (req, res) => {
  const dateParam = typeof req.query.date === "string" ? req.query.date : null;
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });
  }
  const start = new Date(`${dateParam}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const reservations = await prisma.reservation.findMany({
    where: { dateTime: { gte: start, lt: end } },
    include,
    orderBy: { dateTime: "asc" },
  });
  res.json(reservations);
});

const newGuestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

const createReservationSchema = z
  .object({
    guestId: z.string().uuid().optional(),
    newGuest: newGuestSchema.optional(),
    partySize: z.number().int().positive(),
    dateTime: z.coerce.date(),
    tableId: z.string().uuid().nullable().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.guestId || data.newGuest, {
    message: "Either guestId or newGuest is required",
  });

router.post("/", async (req, res) => {
  const parsed = createReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { partySize, dateTime, tableId, notes } = parsed.data;

  if (tableId) {
    const conflict = await findConflictingReservation({ tableId, dateTime });
    if (conflict) {
      return res.status(409).json({ error: conflictMessage(conflict) });
    }
  }

  let guestId = parsed.data.guestId;
  if (!guestId && parsed.data.newGuest) {
    const g = parsed.data.newGuest;
    const guest = await prisma.guest.create({
      data: { firstName: g.firstName, lastName: g.lastName, phone: g.phone || null, email: g.email || null },
    });
    guestId = guest.id;
  }

  const shift = await findShiftForDateTime(dateTime);

  const reservation = await prisma.reservation.create({
    data: {
      guestId: guestId!,
      partySize,
      dateTime,
      tableId: tableId || null,
      shiftId: shift?.id,
      notes,
      createdById: req.user!.sub,
    },
    include,
  });

  const cap = await checkPacingCap({ dateTime, partySize, shiftId: shift?.id });
  if (cap.overCap) {
    console.warn(`[pacing] reservation ${reservation.id} exceeds cap: ${cap.capDetail}`);
  }
  res.status(201).json({ ...reservation, overCap: cap.overCap, capDetail: cap.capDetail });
});

const updateReservationSchema = z.object({
  partySize: z.number().int().positive().optional(),
  dateTime: z.coerce.date().optional(),
  tableId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(ReservationStatus).optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const existing = await prisma.reservation.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Reservation not found" });
  }

  // A table can't literally seat two parties at once, so this blocks the save (unlike the
  // pacing cap above, which only warns). Runs whenever the table being assigned is changing, or
  // an already-assigned table's time is moving, since either can newly collide with another
  // reservation on that table.
  const effectiveTableId = parsed.data.tableId !== undefined ? parsed.data.tableId : existing.tableId;
  if (effectiveTableId && (parsed.data.tableId !== undefined || parsed.data.dateTime !== undefined)) {
    const conflict = await findConflictingReservation({
      tableId: effectiveTableId,
      dateTime: parsed.data.dateTime ?? existing.dateTime,
      excludeId: existing.id,
    });
    if (conflict) {
      return res.status(409).json({ error: conflictMessage(conflict) });
    }
  }

  const data: Record<string, unknown> = { ...parsed.data };

  // Re-resolve the shift whenever the time changes, so pacing/reporting stay accurate.
  if (parsed.data.dateTime) {
    const shift = await findShiftForDateTime(parsed.data.dateTime);
    data.shiftId = shift?.id ?? null;
  }
  if (parsed.data.status === "SEATED") {
    data.seatedAt = new Date();
  }
  if (parsed.data.status === "COMPLETED" || parsed.data.status === "NO_SHOW" || parsed.data.status === "CANCELLED") {
    data.completedAt = new Date();
  }

  let cap: { overCap: boolean; capDetail: string | null } = { overCap: false, capDetail: null };
  if (parsed.data.partySize !== undefined || parsed.data.dateTime !== undefined || parsed.data.status !== undefined) {
    cap = await checkPacingCap({
      dateTime: parsed.data.dateTime ?? existing.dateTime,
      partySize: parsed.data.partySize ?? existing.partySize,
      shiftId: parsed.data.dateTime ? (data.shiftId as string | null) : existing.shiftId,
      excludeId: existing.id,
    });
    if (cap.overCap) {
      console.warn(`[pacing] reservation ${existing.id} update exceeds cap: ${cap.capDetail}`);
    }
  }

  try {
    const reservation = await prisma.reservation.update({
      where: { id: req.params.id },
      data,
      include,
    });
    // Visit count reflects guests who actually showed up, not just booked — increment only on
    // the transition into COMPLETED so re-saving an already-completed reservation can't double-count.
    if (parsed.data.status === "COMPLETED" && existing.status !== "COMPLETED") {
      await prisma.guest.update({
        where: { id: reservation.guestId },
        data: { visitCount: { increment: 1 } },
      });
    }

    // Keep the floor plan in sync with the reservation book: seating a reservation occupies its
    // table, and completing it buses the table for cleaning — mirrors the waitlist's seat-now flow.
    if (parsed.data.status === "SEATED" && reservation.tableId) {
      const updatedTable = await prisma.restaurantTable.update({
        where: { id: reservation.tableId },
        data: { status: "SEATED", statusUpdatedAt: new Date() },
      });
      getIO().emit("table:updated", updatedTable);
    } else if (parsed.data.status === "COMPLETED" && reservation.tableId) {
      const table = await prisma.restaurantTable.findUnique({ where: { id: reservation.tableId } });
      if (table && table.status === "SEATED") {
        const updatedTable = await prisma.restaurantTable.update({
          where: { id: reservation.tableId },
          data: { status: "NEEDS_CLEANING", statusUpdatedAt: new Date() },
        });
        getIO().emit("table:updated", updatedTable);
      }
    }

    res.json({ ...reservation, overCap: cap.overCap, capDetail: cap.capDetail });
  } catch {
    res.status(404).json({ error: "Reservation not found" });
  }
});

export default router;
