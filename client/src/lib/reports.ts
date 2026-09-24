export interface ReportSummary {
  totalReservations: number;
  totalCovers: number;
  noShowRate: number;
  cancellationRate: number;
  avgPartySize: number;
  avgTurnMinutes: number | null;
  reservationsByHour: { hour: number; count: number }[];
}

export function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export interface ShiftOccurrenceMetrics {
  date: string;
  totalParties: number;
  totalCovers: number;
  shortNoticeCovers: number;
  walkInCovers: number;
  cancelledCovers: number;
  noShowCovers: number;
  largePartyCount: number;
  regularPartyCount: number;
}

export interface ShiftOverview {
  shift: { id: string; name: string; dayOfWeek: number };
  date: string;
  current: ShiftOccurrenceMetrics;
  trendAverage: Record<
    "totalParties" | "totalCovers" | "shortNoticeCovers" | "walkInCovers" | "cancelledCovers" | "noShowCovers",
    number | null
  >;
  partiesChart: { date: string; largePartyCount: number; regularPartyCount: number }[];
}

// Formats a trend-average number to one decimal place, e.g. "12.5" — averaged across several
// occurrences, so it's rarely a whole number.
export function formatTrend(n: number | null): string {
  return n === null ? "—" : n.toFixed(1);
}

export function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${period}`;
}
