export type TableShape = "ROUND" | "SQUARE" | "RECTANGLE";
export type TableStatus = "OPEN" | "SEATED" | "ORDERED" | "NEEDS_CLEANING";

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
