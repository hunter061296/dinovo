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
