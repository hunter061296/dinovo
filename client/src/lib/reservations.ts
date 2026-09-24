import type { RestaurantTable } from "./tables";

export type ReservationStatus = "BOOKED" | "SEATED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  visitCount: number;
  noShowCount: number;
  cancellationCount: number;
  tags: string[];
  // System-inferred tags (e.g. "Regular", "Lapsing") — kept separate from the host-editable
  // `tags` above; see server/src/lib/guestTags.ts. Merge for display, don't conflate the two.
  autoTags: string[];
  notes: string | null;
  // Short label (e.g. "Anniversary") + "MM-DD" date, no year — see server/prisma/schema.prisma.
  specialOccasion: string | null;
  specialOccasionDate: string | null;
  // Present on search/list results (most recent reservation only) — absent when a Guest comes
  // embedded in a Reservation, since that reservation already implies at least one visit.
  reservations?: { dateTime: string; status: ReservationStatus }[];
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Formats a "MM-DD" special-occasion date as e.g. "Mar 14".
export function formatOccasionDate(mmdd: string): string {
  const [month, day] = mmdd.split("-").map(Number);
  const label = MONTH_LABELS[month - 1];
  return label ? `${label} ${day}` : mmdd;
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
  tags: string[];
  generalNote: string | null;
  offerNote: string | null;
  foodDrinkNote: string | null;
  seatingNote: string | null;
  excludeFromPacing: boolean;
  seatedAt: string | null;
  completedAt: string | null;
}

// Per-visit occasion tags — separate from Guest.tags (SUGGESTED_TAGS in lib/guests.ts), which
// describe the person rather than this one reservation.
export const SUGGESTED_RESERVATION_TAGS = ["Anniversary", "Birthday", "Date Night", "Business", "Special Occasion"];

export const STATUS_BANNER_STYLES: Record<ReservationStatus, string> = {
  BOOKED: "bg-gray-100 text-gray-800 dark:bg-gray-700/60 dark:text-gray-200",
  SEATED: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  NO_SHOW: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  CANCELLED: "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  BOOKED: "Booked",
  SEATED: "Seated",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

export const STATUS_STYLES: Record<ReservationStatus, string> = {
  BOOKED: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600",
  SEATED: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-600",
  COMPLETED: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-600",
  NO_SHOW: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-600",
  CANCELLED: "bg-gray-100 text-gray-400 border-gray-200 line-through dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700",
};

export function minutesToLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}
