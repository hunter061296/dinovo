import type { RestaurantTable } from "./tables";

export type WaitlistStatus = "WAITING" | "SEATED" | "CANCELLED";

export interface WaitlistEntry {
  id: string;
  guestName: string;
  phone: string | null;
  partySize: number;
  quotedWaitMinutes: number;
  status: WaitlistStatus;
  seatedTableId: string | null;
  seatedTable: RestaurantTable | null;
  addedAt: string;
  seatedAt: string | null;
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}
