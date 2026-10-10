import { describe, expect, it } from "vitest";
import { DEFAULT_TURN_MINUTES, reservationDuration, resolveTurnMinutes } from "../src/lib/turnTimes";

const house = [
  { shiftId: null, maxPartySize: 2, minutes: 75 },
  { shiftId: null, maxPartySize: 4, minutes: 90 },
  { shiftId: null, maxPartySize: 8, minutes: 120 },
];
const lunch = [
  { shiftId: "lunch", maxPartySize: 2, minutes: 45 },
  { shiftId: "lunch", maxPartySize: 6, minutes: 60 },
];

describe("resolveTurnMinutes", () => {
  it("falls back to the flat default when nothing is configured", () => {
    expect(resolveTurnMinutes([], 4, null)).toBe(DEFAULT_TURN_MINUTES);
  });

  it("picks the smallest bracket that fits the party", () => {
    expect(resolveTurnMinutes(house, 1, null)).toBe(75);
    expect(resolveTurnMinutes(house, 2, null)).toBe(75);
    expect(resolveTurnMinutes(house, 3, null)).toBe(90);
    expect(resolveTurnMinutes(house, 5, null)).toBe(120);
  });

  it("gives a party bigger than every bracket the largest bracket's time", () => {
    expect(resolveTurnMinutes(house, 14, null)).toBe(120);
  });

  it("uses only a shift's own brackets when it has any", () => {
    expect(resolveTurnMinutes([...house, ...lunch], 2, "lunch")).toBe(45);
    // Not the house 8-top bracket — the shift's set replaces the house set entirely.
    expect(resolveTurnMinutes([...house, ...lunch], 8, "lunch")).toBe(60);
  });

  it("uses house brackets for a shift without overrides", () => {
    expect(resolveTurnMinutes([...house, ...lunch], 2, "dinner")).toBe(75);
  });

  it("lets a reservation's own override win", () => {
    expect(reservationDuration(house, { partySize: 2, shiftId: null, durationMinutes: 150 })).toBe(150);
    expect(reservationDuration(house, { partySize: 2, shiftId: null, durationMinutes: null })).toBe(75);
  });
});
