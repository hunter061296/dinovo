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
}
