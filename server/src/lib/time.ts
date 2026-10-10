// Every "what day / what time is this reservation" question is answered in the restaurant's own
// timezone, never the server's. A server in UTC (as on Render) would otherwise file an 8pm
// Eastern booking under midnight the next day — wrong shift, no pacing rule, and the wrong
// day's reservation list.
//
// RESTAURANT_TIMEZONE is an IANA name (e.g. "America/New_York"). It falls back to the server's
// own zone, which keeps local development (server and browser on the same machine) unchanged.
export const RESTAURANT_TIMEZONE = resolveTimezone(process.env.RESTAURANT_TIMEZONE);

function resolveTimezone(configured: string | undefined): string {
  const tz = configured?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new Error(`RESTAURANT_TIMEZONE "${tz}" is not a valid IANA timezone (e.g. "America/New_York")`);
  }
  return tz;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      // h23, not hour12: false — the latter renders midnight as "24" in some engines.
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0 = Sunday, matching Shift.dayOfWeek
  minutesOfDay: number;
  isoDate: string; // YYYY-MM-DD
}

export function zonedParts(date: Date, tz: string = RESTAURANT_TIMEZONE): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) parts[p.type] = p.value;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second: Number(parts.second),
    dayOfWeek: WEEKDAYS.indexOf(parts.weekday),
    minutesOfDay: hour * 60 + minute,
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

// How far `tz`'s wall clock is ahead of UTC at this instant, in ms (negative west of Greenwich).
function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const wallAsUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUTC - Math.floor(date.getTime() / 1000) * 1000;
}

function parseISODate(isoDate: string): [number, number, number] {
  const [y, m, d] = isoDate.split("-").map(Number);
  return [y, m, d];
}

// The instant at which the restaurant's wall clock reads `minutesOfDay` on `isoDate`. Minutes
// past 1440 roll into the next day. Re-checks the offset once so a date that straddles a DST
// change still lands on the right wall-clock time.
export function zonedDateTime(isoDate: string, minutesOfDay: number, tz: string = RESTAURANT_TIMEZONE): Date {
  const [y, m, d] = parseISODate(isoDate);
  const wallAsUTC = Date.UTC(y, m - 1, d, 0, minutesOfDay);
  const firstGuess = wallAsUTC - offsetMs(new Date(wallAsUTC), tz);
  const correctedOffset = offsetMs(new Date(firstGuess), tz);
  return new Date(wallAsUTC - correctedOffset);
}

export function addDaysToISODate(isoDate: string, days: number): string {
  const [y, m, d] = parseISODate(isoDate);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

export function dayOfWeekForISODate(isoDate: string): number {
  const [y, m, d] = parseISODate(isoDate);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function toZonedISODate(date: Date, tz: string = RESTAURANT_TIMEZONE): string {
  return zonedParts(date, tz).isoDate;
}

// [start, end) of a restaurant calendar day — not always 24h long, thanks to DST.
export function zonedDayBounds(isoDate: string, tz: string = RESTAURANT_TIMEZONE): { start: Date; end: Date } {
  return { start: zonedDateTime(isoDate, 0, tz), end: zonedDateTime(addDaysToISODate(isoDate, 1), 0, tz) };
}

export function todayISODate(tz: string = RESTAURANT_TIMEZONE): string {
  return toZonedISODate(new Date(), tz);
}

export function formatZonedTime(date: Date, tz: string = RESTAURANT_TIMEZONE): string {
  // Newer ICU puts a narrow no-break space before AM/PM; normalize so messages read plainly.
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date).replace(/\u202f/g, " ");
}

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
