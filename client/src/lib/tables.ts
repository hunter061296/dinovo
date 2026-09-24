export type TableShape = "ROUND" | "SQUARE" | "RECTANGLE";
export type TableStatus = "OPEN" | "SEATED" | "ORDERED" | "NEEDS_CLEANING";

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  OPEN: "Open",
  SEATED: "Seated",
  ORDERED: "Ordered",
  NEEDS_CLEANING: "Needs Cleaning",
};

export interface RestaurantTable {
  id: string;
  number: number;
  capacity: number;
  shape: TableShape;
  positionX: number;
  positionY: number;
  status: TableStatus;
  statusUpdatedAt: string;
  sectionId: string | null;
}

// Rendered size of a table on the floor plan canvas, in unscaled canvas pixels.
export function tableSize(capacity: number, shape: TableShape) {
  const base = Math.min(56 + capacity * 4, 140);
  if (shape === "RECTANGLE") return { width: base * 1.6, height: base * 0.8 };
  return { width: base, height: base };
}

// A chair drawn around a table: a `length` x `thickness` bar centered on (cx, cy), rotated by
// `angle` degrees. Coordinates are relative to the table body's top-left corner, so chairs sit
// just outside the body and never change the table's own size or snap/drag math.
export interface Seat {
  cx: number;
  cy: number;
  length: number;
  thickness: number;
  angle: number;
}

export const SEAT_THICKNESS = 6;
export const SEAT_GAP = 1;
const MAX_SEAT_LENGTH = 20;
const MIN_SEAT_LENGTH = 6;

function seatLength(spacePerSeat: number) {
  return Math.max(MIN_SEAT_LENGTH, Math.min(MAX_SEAT_LENGTH, spacePerSeat - 6));
}

function sideSeats(count: number, sideLength: number, place: (along: number) => Omit<Seat, "length" | "thickness">): Seat[] {
  const length = seatLength(sideLength / Math.max(count, 1));
  return Array.from({ length: count }, (_, i) => ({
    ...place((sideLength * (i + 0.5)) / count),
    length,
    thickness: SEAT_THICKNESS,
  }));
}

export function seatLayout(capacity: number, shape: TableShape): Seat[] {
  const { width, height } = tableSize(capacity, shape);
  const offset = SEAT_GAP + SEAT_THICKNESS / 2;

  if (shape === "ROUND") {
    const r = width / 2;
    const length = seatLength((2 * Math.PI * r) / Math.max(capacity, 1));
    return Array.from({ length: capacity }, (_, i) => {
      const theta = (2 * Math.PI * i) / capacity;
      return {
        cx: r + (r + offset) * Math.sin(theta),
        cy: r - (r + offset) * Math.cos(theta),
        length,
        thickness: SEAT_THICKNESS,
        angle: (theta * 180) / Math.PI,
      };
    });
  }

  let top: number, bottom: number, left: number, right: number;
  if (shape === "RECTANGLE") {
    // Long sides first; end seats only once the table is big enough to need them (8+).
    const ends = capacity >= 8 ? 1 : 0;
    const rest = capacity - ends * 2;
    top = Math.ceil(rest / 2);
    bottom = Math.floor(rest / 2);
    left = ends;
    right = ends;
  } else {
    // Square: deal seats round-robin so opposite sides fill evenly (2 = facing, 4 = one per side).
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < capacity; i++) counts[i % 4]++;
    [top, bottom, left, right] = counts;
  }

  return [
    ...sideSeats(top, width, (x) => ({ cx: x, cy: -offset, angle: 0 })),
    ...sideSeats(bottom, width, (x) => ({ cx: x, cy: height + offset, angle: 0 })),
    ...sideSeats(left, height, (y) => ({ cx: -offset, cy: y, angle: 90 })),
    ...sideSeats(right, height, (y) => ({ cx: width + offset, cy: y, angle: 90 })),
  ];
}

export interface Section {
  id: string;
  name: string;
  position: number;
}

export interface SeatedSummaryEntry {
  tableId: string;
  tableNumber: number;
  capacity: number;
  statusUpdatedAt: string;
  guestName: string | null;
  partySize: number | null;
}
