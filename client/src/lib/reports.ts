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

export function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${period}`;
}
