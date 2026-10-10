// Pure layout math for the reservation grid view (tables x time). Kept free of React so the
// snapping/lane rules are easy to reason about on their own.

export const SNAP_MINUTES = 15;

// Minutes from the browsed date's local midnight — can exceed 1440 for a party that runs past
// midnight, or go negative for a block that started the day before.
export function minutesFromDayStart(iso: string, date: string): number {
  const dayStart = new Date(`${date}T00:00:00`).getTime();
  return Math.round((new Date(iso).getTime() - dayStart) / 60_000);
}

// The ISO instant `minutes` after the browsed date's local midnight.
export function isoAtMinutes(date: string, minutes: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setMinutes(minutes);
  return d.toISOString();
}

export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

export interface Span {
  start: number;
  end: number;
}

// The visible window: the day's shifts, widened to fit anything booked outside them, rounded out
// to whole hours. Falls back to 11am-11pm on a day with no shifts.
export function gridRange(shiftSpans: Span[], itemSpans: Span[]): Span {
  const base = shiftSpans.length > 0 ? shiftSpans : [{ start: 11 * 60, end: 23 * 60 }];
  let start = Math.min(...base.map((s) => s.start));
  let end = Math.max(...base.map((s) => s.end));
  for (const s of itemSpans) {
    start = Math.min(start, s.start);
    end = Math.max(end, s.end);
  }
  start = Math.max(0, Math.floor(start / 60) * 60);
  // Allow a couple of hours past midnight for late seatings; beyond that is clipped.
  end = Math.min(26 * 60, Math.ceil(end / 60) * 60);
  return { start, end: Math.max(end, start + 60) };
}

// Greedy interval stacking: each item goes in the first lane whose last item has ended, so
// overlapping parties (only possible in the Unassigned lane, or from data that predates the
// conflict check) are drawn one above the other instead of on top of each other.
export function assignLanes<T extends Span>(items: T[]): { item: T; lane: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const laneEnds: number[] = [];
  return sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    return { item, lane };
  });
}

export function formatHourLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${period}`;
}

export function formatClock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}
