import { describe, expect, it } from "vitest";
import { addDaysToISODate, dayOfWeekForISODate, formatZonedTime, zonedDateTime, zonedDayBounds, zonedParts } from "../src/lib/time";

const NY = "America/New_York";

describe("restaurant-timezone helpers", () => {
  it("files a 9pm New York reservation under its own day, not the next UTC day", () => {
    const ninePm = zonedDateTime("2026-10-10", 21 * 60, NY);
    expect(ninePm.toISOString()).toBe("2026-10-11T01:00:00.000Z");
    const parts = zonedParts(ninePm, NY);
    expect(parts.isoDate).toBe("2026-10-10");
    expect(parts.dayOfWeek).toBe(6); // Saturday
    expect(parts.minutesOfDay).toBe(21 * 60);
  });

  it("gives DST-change days their real length", () => {
    const fallBack = zonedDayBounds("2026-11-01", NY);
    expect((fallBack.end.getTime() - fallBack.start.getTime()) / 3_600_000).toBe(25);
    const springForward = zonedDayBounds("2026-03-08", NY);
    expect((springForward.end.getTime() - springForward.start.getTime()) / 3_600_000).toBe(23);
  });

  it("resolves wall-clock times on either side of a DST change", () => {
    expect(zonedDateTime("2026-03-08", 3 * 60, NY).toISOString()).toBe("2026-03-08T07:00:00.000Z");
    expect(zonedDateTime("2026-11-01", 3 * 60, NY).toISOString()).toBe("2026-11-01T08:00:00.000Z");
  });

  it("handles zones east of UTC with half-hour offsets", () => {
    expect(zonedDateTime("2026-10-10", 19 * 60, "Asia/Kolkata").toISOString()).toBe("2026-10-10T13:30:00.000Z");
  });

  it("does calendar math on ISO dates", () => {
    expect(addDaysToISODate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToISODate("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayOfWeekForISODate("2026-10-10")).toBe(6);
  });

  it("formats times in the restaurant's zone", () => {
    expect(formatZonedTime(new Date("2026-10-11T01:00:00Z"), NY)).toBe("9:00 PM");
  });
});
