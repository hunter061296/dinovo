import type { Guest, ReservationStatus } from "./reservations";
import type { RestaurantTable } from "./tables";

export interface VisitHistoryEntry {
  id: string;
  partySize: number;
  dateTime: string;
  status: ReservationStatus;
  table: RestaurantTable | null;
  notes: string | null;
}

export interface GuestDetail extends Guest {
  reservations: VisitHistoryEntry[];
}

export const SUGGESTED_TAGS = ["VIP", "Regular", "Allergy", "Large Party"];
