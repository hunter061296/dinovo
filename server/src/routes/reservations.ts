import { Router } from "express";
import { z } from "zod";
import { Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { findShiftForDateTime } from "../lib/shiftMatch";
import { checkPacingCap } from "../lib/pacing";
import { findConflict, conflictMessage, occupiedTableIds, MAX_DURATION_MINUTES } from "../lib/tableAvailability";
import { recomputeAutoTags } from "../lib/guestTags";
import { getIO } from "../lib/socket";
import { ISO_DATE_REGEX, zonedDayBounds } from "../lib/time";
import { loadTurnTimes, reservationDuration, type TurnTimeRule } from "../lib/turnTimes";
import { planStatusTransition } from "../lib/reservationStatus";

const router = Router();

router.use(authenticate);

const include = {
  guest: true,
  table: true,
  shift: true,
  combination: { include: { tables: { orderBy: { number: "asc" } } } },
} as const satisfies Prisma.ReservationInclude;

type ReservationWithRelations = Prisma.ReservationGetPayload<{ include: typeof include }>;

// Every response carries the duration the party actually holds its table(s) for — the grid view
// draws bars from it, and it's the same number the conflict check uses.
function withDuration(r: ReservationWithRelations, rules: TurnTimeRule[]) {
  return { ...r, effectiveDurationMinutes: reservationDuration(rules, r) };
}

const OCCUPYING: ReservationStatus[] = ["BOOKED", "SEATED"];

router.get("/", async (req, res) => {
  const dateParam = typeof req.query.date === "string" ? req.query.date : null;
  if (!dateParam || !ISO_DATE_REGEX.test(dateParam)) {
    return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });
  }
  // The restaurant's calendar day, not the server's (lib/time.ts).
  const { start, end } = zonedDayBounds(dateParam);

  const [reservations, rules] = await Promise.all([
    prisma.reservation.findMany({
      where: { dateTime: { gte: start, lt: end } },
      include,
      orderBy: { dateTime: "asc" },
    }),
    loadTurnTimes(),
  ]);
  res.json(reservations.map((r) => withDuration(r, rules)));
});

const newGuestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

const durationSchema = z.number().int().min(15).max(MAX_DURATION_MINUTES);

const createReservationSchema = z
  .object({
    guestId: z.string().uuid().optional(),
    newGuest: newGuestSchema.optional(),
    partySize: z.number().int().positive(),
    dateTime: z.coerce.date(),
    tableId: z.string().uuid().nullable().optional(),
    combinationId: z.string().uuid().nullable().optional(),
    durationMinutes: durationSchema.nullable().optional(),
    tags: z.array(z.string().min(1)).optional(),
    generalNote: z.string().optional(),
    offerNote: z.string().optional(),
    foodDrinkNote: z.string().optional(),
    seatingNote: z.string().optional(),
    excludeFromPacing: z.boolean().optional(),
  })
  .refine((data) => data.guestId || data.newGuest, {
    message: "Either guestId or newGuest is required",
  });

type Assignment = { tableId: string | null; combinationId: string | null; tableIds: string[] };

// Resolves a requested table or combination into what gets stored plus every table it occupies.
// A combination stores its lowest-numbered table as `tableId` (see schema comment). Returns an
// error string for an id that doesn't exist, rather than letting the insert hit a foreign key.
async function resolveAssignment(tableId: string | null, combinationId: string | null): Promise<Assignment | string> {
  if (combinationId) {
    const combination = await prisma.tableCombination.findUnique({
      where: { id: combinationId },
      include: { tables: { orderBy: { number: "asc" } } },
    });
    if (!combination || combination.tables.length === 0) return "Table combination not found";
    return { tableId: combination.tables[0].id, combinationId, tableIds: combination.tables.map((t) => t.id) };
  }
  if (tableId) {
    const table = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (!table) return "Table not found";
    return { tableId, combinationId: null, tableIds: [tableId] };
  }
  return { tableId: null, combinationId: null, tableIds: [] };
}

router.post("/", async (req, res) => {
  const parsed = createReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { partySize, dateTime, durationMinutes, tags, generalNote, offerNote, foodDrinkNote, seatingNote, excludeFromPacing } =
    parsed.data;

  if (parsed.data.guestId) {
    const guest = await prisma.guest.findUnique({ where: { id: parsed.data.guestId } });
    if (!guest) return res.status(400).json({ error: "Guest not found" });
  }

  const assignment = await resolveAssignment(parsed.data.tableId ?? null, parsed.data.combinationId ?? null);
  if (typeof assignment === "string") return res.status(400).json({ error: assignment });

  const [shift, rules] = await Promise.all([findShiftForDateTime(dateTime), loadTurnTimes()]);
  const duration = reservationDuration(rules, { partySize, shiftId: shift?.id ?? null, durationMinutes: durationMinutes ?? null });

  const conflict = await findConflict({ tableIds: assignment.tableIds, start: dateTime, durationMinutes: duration });
  if (conflict) {
    return res.status(409).json({ error: conflictMessage(conflict) });
  }

  let guestId = parsed.data.guestId;
  if (!guestId && parsed.data.newGuest) {
    const g = parsed.data.newGuest;
    const guest = await prisma.guest.create({
      data: { firstName: g.firstName, lastName: g.lastName, phone: g.phone || null, email: g.email || null },
    });
    guestId = guest.id;
  }

  const reservation = await prisma.reservation.create({
    data: {
      guestId: guestId!,
      partySize,
      dateTime,
      tableId: assignment.tableId,
      combinationId: assignment.combinationId,
      durationMinutes: durationMinutes ?? null,
      shiftId: shift?.id,
      tags,
      generalNote,
      offerNote,
      foodDrinkNote,
      seatingNote,
      excludeFromPacing,
      createdById: req.user!.sub,
    },
    include,
  });

  // The reservation now exists, so leave it out of the slot's existing covers — otherwise its own
  // party is counted twice (once as "existing", once as the new party).
  const cap = await checkPacingCap({ dateTime, partySize, shiftId: shift?.id, excludeId: reservation.id, excludeFromPacing });
  if (cap.overCap) {
    console.warn(`[pacing] reservation ${reservation.id} exceeds cap: ${cap.capDetail}`);
  }
  res.status(201).json({ ...withDuration(reservation, rules), overCap: cap.overCap, capDetail: cap.capDetail });
});

const updateReservationSchema = z.object({
  partySize: z.number().int().positive().optional(),
  dateTime: z.coerce.date().optional(),
  tableId: z.string().uuid().nullable().optional(),
  combinationId: z.string().uuid().nullable().optional(),
  durationMinutes: durationSchema.nullable().optional(),
  tags: z.array(z.string().min(1)).optional(),
  generalNote: z.string().optional(),
  offerNote: z.string().optional(),
  foodDrinkNote: z.string().optional(),
  seatingNote: z.string().optional(),
  excludeFromPacing: z.boolean().optional(),
  status: z.nativeEnum(ReservationStatus).optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const body = parsed.data;

  const existing = await prisma.reservation.findUnique({ where: { id: req.params.id }, include });
  if (!existing) {
    return res.status(404).json({ error: "Reservation not found" });
  }

  // Table assignment: a combination wins; a plain tableId clears any combination; neither keeps
  // what's there.
  let assignment: Assignment = {
    tableId: existing.tableId,
    combinationId: existing.combinationId,
    tableIds: occupiedTableIds(existing),
  };
  if (body.combinationId !== undefined || body.tableId !== undefined) {
    const resolved =
      body.combinationId !== undefined && body.combinationId !== null
        ? await resolveAssignment(null, body.combinationId)
        : await resolveAssignment(body.tableId !== undefined ? body.tableId : existing.tableId, null);
    if (typeof resolved === "string") return res.status(400).json({ error: resolved });
    assignment = resolved;
  }

  const rules = await loadTurnTimes();
  const dateTime = body.dateTime ?? existing.dateTime;
  const partySize = body.partySize ?? existing.partySize;
  const status = body.status ?? existing.status;
  // Re-resolve the shift whenever the time changes, so pacing/reporting/turn times stay accurate.
  const shiftId = body.dateTime ? ((await findShiftForDateTime(body.dateTime))?.id ?? null) : existing.shiftId;
  const durationMinutes = body.durationMinutes !== undefined ? body.durationMinutes : existing.durationMinutes;

  // A table can't literally seat two parties at once, so this blocks the save (unlike the pacing
  // cap below, which only warns). Re-checked whenever anything that decides which tables are held,
  // or for how long, actually changes — including reinstating a cancelled reservation. Compared by
  // value, since the edit form re-sends every field on every save (a note edit shouldn't re-check).
  const reinstating = !OCCUPYING.includes(existing.status) && OCCUPYING.includes(status);
  const holdChanging =
    assignment.tableId !== existing.tableId ||
    assignment.combinationId !== existing.combinationId ||
    dateTime.getTime() !== existing.dateTime.getTime() ||
    partySize !== existing.partySize ||
    durationMinutes !== existing.durationMinutes ||
    reinstating;
  if (holdChanging && OCCUPYING.includes(status)) {
    const conflict = await findConflict({
      tableIds: assignment.tableIds,
      start: dateTime,
      durationMinutes: reservationDuration(rules, { partySize, shiftId, durationMinutes }),
      excludeReservationId: existing.id,
    });
    if (conflict) {
      return res.status(409).json({ error: conflictMessage(conflict) });
    }
  }

  const plan = planStatusTransition(existing.status, status, existing);

  let cap: { overCap: boolean; capDetail: string | null } = { overCap: false, capDetail: null };
  if (
    body.partySize !== undefined ||
    body.dateTime !== undefined ||
    body.status !== undefined ||
    body.excludeFromPacing !== undefined
  ) {
    cap = await checkPacingCap({
      dateTime,
      partySize,
      shiftId,
      excludeId: existing.id,
      excludeFromPacing: body.excludeFromPacing ?? existing.excludeFromPacing,
    });
    if (cap.overCap) {
      console.warn(`[pacing] reservation ${existing.id} update exceeds cap: ${cap.capDetail}`);
    }
  }

  const { combinationId: _c, tableId: _t, ...plainFields } = body;
  const now = new Date();
  const { reservation, updatedTables } = await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.update({
      where: { id: existing.id },
      data: {
        ...plainFields,
        tableId: assignment.tableId,
        combinationId: assignment.combinationId,
        shiftId,
        ...plan.timestamps,
      },
      include,
    });

    // Guest counters follow the status: +1 entering Completed/No-show/Cancelled, -1 leaving it.
    // The decrement is guarded so a counter that was already out of sync can't go negative.
    for (const { field, delta } of plan.counterDeltas) {
      if (delta > 0) {
        await tx.guest.update({ where: { id: reservation.guestId }, data: { [field]: { increment: 1 } } });
      } else {
        await tx.guest.updateMany({ where: { id: reservation.guestId, [field]: { gt: 0 } }, data: { [field]: { decrement: 1 } } });
      }
    }

    // Keep the floor plan in sync with the reservation book: seating occupies the party's
    // table(s); a seated party leaving buses them; undoing a seating frees them. Bus/release only
    // touch tables still occupied, so a table a host already re-statused isn't overwritten.
    const ids = occupiedTableIds(reservation);
    let updatedTables: Awaited<ReturnType<typeof tx.restaurantTable.findMany>> = [];
    if (plan.tableAction && ids.length > 0) {
      const occupied = { in: ["SEATED", "ORDERED"] as ("SEATED" | "ORDERED")[] };
      const where =
        plan.tableAction === "seat" ? { id: { in: ids } } : { id: { in: ids }, status: occupied };
      const touched = await tx.restaurantTable.findMany({ where, select: { id: true } });
      const newStatus = plan.tableAction === "seat" ? "SEATED" : plan.tableAction === "bus" ? "NEEDS_CLEANING" : "OPEN";
      await tx.restaurantTable.updateMany({
        where: { id: { in: touched.map((t) => t.id) } },
        data: { status: newStatus, statusUpdatedAt: now },
      });
      updatedTables = await tx.restaurantTable.findMany({ where: { id: { in: touched.map((t) => t.id) } } });
    }

    return { reservation, updatedTables };
  });

  if (plan.counterDeltas.some((d) => d.field === "visitCount" || d.field === "noShowCount")) {
    await recomputeAutoTags(reservation.guestId);
  }
  for (const table of updatedTables) getIO().emit("table:updated", table);

  res.json({ ...withDuration(reservation, rules), overCap: cap.overCap, capDetail: cap.capDetail });
});

export default router;
