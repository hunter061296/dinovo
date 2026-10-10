import { ReservationStatus } from "@prisma/client";

// Which Guest counter each status feeds. Entering the status increments it, leaving it (a host
// correcting a mis-click, e.g. COMPLETED back to SEATED) decrements it, so the counters always
// match the guest's reservations' current statuses.
const COUNTER_FOR_STATUS: Partial<Record<ReservationStatus, "visitCount" | "noShowCount" | "cancellationCount">> = {
  COMPLETED: "visitCount",
  NO_SHOW: "noShowCount",
  CANCELLED: "cancellationCount",
};

const TERMINAL: ReservationStatus[] = ["COMPLETED", "NO_SHOW", "CANCELLED"];

export type TableAction =
  // Party sat down: mark the reservation's table(s) SEATED.
  | "seat"
  // Party left a table they were sitting at: bus it (NEEDS_CLEANING).
  | "bus"
  // Seating was undone (SEATED -> BOOKED): the table never really turned, so it's OPEN again.
  | "release"
  | null;

export interface StatusTransitionPlan {
  counterDeltas: { field: "visitCount" | "noShowCount" | "cancellationCount"; delta: 1 | -1 }[];
  timestamps: { seatedAt?: Date | null; completedAt?: Date | null };
  tableAction: TableAction;
}

// Pure description of everything a reservation status change implies, so the route only has to
// apply it. Returns an empty plan when the status isn't actually changing — the edit form always
// sends `status`, and re-saving notes on a Completed reservation must not reset its completedAt
// (that would corrupt the turn-time report) or re-seat its table.
export function planStatusTransition(
  from: ReservationStatus,
  to: ReservationStatus,
  existing: { seatedAt: Date | null },
  now: Date = new Date(),
): StatusTransitionPlan {
  const plan: StatusTransitionPlan = { counterDeltas: [], timestamps: {}, tableAction: null };
  if (from === to) return plan;

  const leaving = COUNTER_FOR_STATUS[from];
  if (leaving) plan.counterDeltas.push({ field: leaving, delta: -1 });
  const entering = COUNTER_FOR_STATUS[to];
  if (entering) plan.counterDeltas.push({ field: entering, delta: 1 });

  if (to === "SEATED") {
    // Fresh seating from BOOKED starts the clock now; undoing a Completed/No-show back to Seated
    // keeps the original seating time so the eventual turn time is still right.
    plan.timestamps = { seatedAt: from === "BOOKED" ? now : (existing.seatedAt ?? now), completedAt: null };
    plan.tableAction = "seat";
  } else if (to === "BOOKED") {
    plan.timestamps = { seatedAt: null, completedAt: null };
    if (from === "SEATED") plan.tableAction = "release";
  } else if (TERMINAL.includes(to)) {
    plan.timestamps = { completedAt: now };
    if (from === "SEATED") plan.tableAction = "bus";
  }

  return plan;
}
