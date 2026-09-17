import type { RestaurantTable } from "./tables";

export type ReservationStatus = "BOOKED" | "SEATED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  visitCount: number;
  tags: string[];
  notes: string | null;
  // Present on search/list results (most recent reservation only) — absent when a Guest comes
  // embedded in a Reservation, since that reservation already implies at least one visit.
  reservations?: { dateTime: string; status: ReservationStatus }[];
}

export interface PacingRule {
  id: string;
  shiftId: string;
  timeSlotMinutes: number;
  maxCovers: number;
  maxPartySize: number;
}

export interface Shift {
  id: string;
  name: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  pacingRules: PacingRule[];
}

export interface Reservation {
  id: string;
  guestId: string;
  guest: Guest;
  partySize: number;
  dateTime: string;
  status: ReservationStatus;
  tableId: string | null;
  table: RestaurantTable | null;
  shiftId: string | null;
  shift: Shift | null;
  notes: string | null;
  seatedAt: string | null;
  completedAt: string | null;
}

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  BOOKED: "Booked",
  SEATED: "Seated",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

export const STATUS_STYLES: Record<ReservationStatus, string> = {
  BOOKED: "bg-gray-100 text-gray-700 border-gray-300",
  SEATED: "bg-blue-100 text-blue-800 border-blue-300",
  COMPLETED: "bg-green-100 text-green-800 border-green-300",
  NO_SHOW: "bg-red-100 text-red-800 border-red-300",
  CANCELLED: "bg-gray-100 text-gray-400 border-gray-200 line-through",
};

export function minutesToLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}
