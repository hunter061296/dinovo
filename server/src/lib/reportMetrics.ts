import { Reservation, Shift } from "@prisma/client";
import { prisma } from "./prisma";

export interface ReportSummary {
  totalReservations: number;
  totalCovers: number;
  noShowRate: number;
  cancellationRate: number;
  avgPartySize: number;
  avgTurnMinutes: number | null;
  reservationsByHour: { hour: number; count: number }[];
}

export function computeReportSummary(reservations: Reservation[]): ReportSummary {
  const total = reservations.length;
  const cancelled = reservations.filter((r) => r.status === "CANCELLED");
  const noShows = reservations.filter((r) => r.status === "NO_SHOW");
  // No-shows and cancellations both come out of the pool of reservations that had a chance to
  // happen — a cancellation isn't a "no-show" of the remaining slate, so it's excluded here.
  const hadAChance = reservations.filter((r) => r.status !== "CANCELLED");
  const servedOrSeated = reservations.filter((r) => r.status === "SEATED" || r.status === "COMPLETED");

  const totalCovers = servedOrSeated.reduce((sum, r) => sum + r.partySize, 0);
  const noShowRate = hadAChance.length ? noShows.length / hadAChance.length : 0;
  const cancellationRate = total ? cancelled.length / total : 0;
  const avgPartySize = hadAChance.length ? hadAChance.reduce((sum, r) => sum + r.partySize, 0) / hadAChance.length : 0;

  // Turn time = seatedAt -> completedAt. We don't keep a full table-status change history (just
  // the table's *current* status), so a reservation's own timestamps — set exactly when a host
  // marks it Seated and then Completed — are the best available proxy for "how long the table
  // was occupied," rather than something derived from RestaurantTable directly.
  const turnTimes = reservations
    .filter((r) => r.status === "COMPLETED" && r.seatedAt && r.completedAt)
    .map((r) => (r.completedAt!.getTime() - r.seatedAt!.getTime()) / 60_000);
  const avgTurnMinutes = turnTimes.length ? turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length : null;

  const hourCounts = new Map<number, number>();
  for (const r of reservations) {
    const hour = r.dateTime.getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const reservationsByHour = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  return { totalReservations: total, totalCovers, noShowRate, cancellationRate, avgPartySize, avgTurnMinutes, reservationsByHour };
}

// ---------- Shift Overview (Phase 3 of the OpenTable-parity work) ----------

// >= 6 covers counts as a "large party" for the party-size trend chart below — an assumption
// called out to the product owner, easy to tune here if they want a different cutoff.
const LARGE_PARTY_THRESHOLD = 6;
// A reservation booked within this window of its own start time counts as "short notice" —
// another tunable assumption, not derived from any product spec.
const SHORT_NOTICE_WINDOW_MS = 3 * 60 * 60 * 1000;

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

export interface ShiftOccurrenceMetrics {
  date: string; // YYYY-MM-DD
  totalParties: number;
  // Reservation covers (seated/completed) plus walk-in covers below — the full picture of who
  // was actually served, not just who was booked.
  totalCovers: number;
  shortNoticeCovers: number;
  // Seated via the Waitlist rather than a Reservation — already counted into totalCovers above,
  // broken out separately since Dinovo has no POS to distinguish "covers" any other way.
  walkInCovers: number;
  cancelledCovers: number;
  noShowCovers: number;
  largePartyCount: number;
  regularPartyCount: number;
}

// One occurrence of a recurring Shift (e.g. "this Friday's Dinner shift") on a specific calendar
// date. Shift itself only stores a dayOfWeek, not a date, so every occurrence is computed fresh
// from a (shift, date) pair — used both for "today's" numbers and for each of the trailing
// weeks' numbers the trend comparison averages over.
export async function computeShiftOccurrence(
  shift: Pick<Shift, "id" | "startMinutes" | "endMinutes">,
  date: Date
): Promise<ShiftOccurrenceMetrics> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const reservations = await prisma.reservation.findMany({
    where: { shiftId: shift.id, dateTime: { gte: dayStart, lt: dayEnd } },
  });

  const totalParties = reservations.length;
  const reservationCovers = reservations
    .filter((r) => r.status === "SEATED" || r.status === "COMPLETED")
    .reduce((sum, r) => sum + r.partySize, 0);
  const cancelledCovers = reservations.filter((r) => r.status === "CANCELLED").reduce((sum, r) => sum + r.partySize, 0);
  const noShowCovers = reservations.filter((r) => r.status === "NO_SHOW").reduce((sum, r) => sum + r.partySize, 0);
  const shortNoticeCovers = reservations
    .filter((r) => r.dateTime.getTime() - r.createdAt.getTime() <= SHORT_NOTICE_WINDOW_MS)
    .reduce((sum, r) => sum + r.partySize, 0);
  const largePartyCount = reservations.filter((r) => r.partySize >= LARGE_PARTY_THRESHOLD).length;
  const regularPartyCount = totalParties - largePartyCount;

  // Walk-ins aren't tied to a Shift record, so match them by the shift's own time-of-day window
  // on this same calendar date instead of a shiftId.
  const walkIns = await prisma.waitlistEntry.findMany({
    where: { status: "SEATED", seatedAt: { gte: dayStart, lt: dayEnd } },
  });
  const walkInCovers = walkIns
    .filter((w) => {
      if (!w.seatedAt) return false;
      const minutes = w.seatedAt.getHours() * 60 + w.seatedAt.getMinutes();
      return minutes >= shift.startMinutes && minutes < shift.endMinutes;
    })
    .reduce((sum, w) => sum + w.partySize, 0);

  return {
    date: toISODate(date),
    totalParties,
    totalCovers: reservationCovers + walkInCovers,
    shortNoticeCovers,
    walkInCovers,
    cancelledCovers,
    noShowCovers,
    largePartyCount,
    regularPartyCount,
  };
}

export interface ShiftOverviewResponse {
  shift: { id: string; name: string; dayOfWeek: number };
  date: string;
  current: ShiftOccurrenceMetrics;
  // Average of the same metric across TREND_LOOKBACK_OCCURRENCES prior occurrences of this same
  // shift (same shiftId, 7/14/21/28 days back) — null fields when there's no prior data at all.
  trendAverage: Record<
    "totalParties" | "totalCovers" | "shortNoticeCovers" | "walkInCovers" | "cancelledCovers" | "noShowCovers",
    number | null
  >;
  // current + the trailing occurrences, oldest first, for the party-size trend chart.
  partiesChart: { date: string; largePartyCount: number; regularPartyCount: number }[];
}

// How many prior occurrences of the same shift (e.g. the last 4 Fridays' dinner shift) the trend
// comparison averages over — tunable, called out to the product owner rather than picked silently.
export const TREND_LOOKBACK_OCCURRENCES = 4;

export async function computeShiftOverview(shift: Shift, date: Date): Promise<ShiftOverviewResponse> {
  const current = await computeShiftOccurrence(shift, date);

  const trailingDates = Array.from(
    { length: TREND_LOOKBACK_OCCURRENCES },
    (_, i) => new Date(date.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000)
  );
  const trailing = await Promise.all(trailingDates.map((d) => computeShiftOccurrence(shift, d)));

  const avg = (key: keyof ShiftOccurrenceMetrics): number | null =>
    trailing.length ? trailing.reduce((sum, t) => sum + (t[key] as number), 0) / trailing.length : null;

  return {
    shift: { id: shift.id, name: shift.name, dayOfWeek: shift.dayOfWeek },
    date: toISODate(date),
    current,
    trendAverage: {
      totalParties: avg("totalParties"),
      totalCovers: avg("totalCovers"),
      shortNoticeCovers: avg("shortNoticeCovers"),
      walkInCovers: avg("walkInCovers"),
      cancelledCovers: avg("cancelledCovers"),
      noShowCovers: avg("noShowCovers"),
    },
    partiesChart: [...trailing].reverse().concat(current).map((t) => ({
      date: t.date,
      largePartyCount: t.largePartyCount,
      regularPartyCount: t.regularPartyCount,
    })),
  };
}
