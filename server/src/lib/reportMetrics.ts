import { Reservation } from "@prisma/client";

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
