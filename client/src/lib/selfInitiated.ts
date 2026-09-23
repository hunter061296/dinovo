// Same pattern as lib/selfUpdatedTables.ts, for the other two entities the toast listener
// (components/SocketToasts.tsx) needs to distinguish "my own action" from "arrived from
// elsewhere" for: waitlist entries (tracked by id, since we always know it) and reservation
// creation (tracked as a flag, since the new row's id doesn't exist yet when the request goes
// out — the socket event could in principle arrive from a genuinely simultaneous create by
// another host within the same ~1s window, but that's rare enough in a single-location host
// stand to accept rather than plumb a request-correlation id through for a toast).
const SELF_UPDATE_WINDOW_MS = 1000;

const recentlySelfUpdatedWaitlistEntries = new Set<string>();

export function markWaitlistEntrySelfUpdated(entryId: string): void {
  recentlySelfUpdatedWaitlistEntries.add(entryId);
  setTimeout(() => recentlySelfUpdatedWaitlistEntries.delete(entryId), SELF_UPDATE_WINDOW_MS);
}

export function wasWaitlistEntrySelfUpdated(entryId: string): boolean {
  return recentlySelfUpdatedWaitlistEntries.has(entryId);
}

let recentlyCreatedReservation = false;

export function markReservationSelfCreated(): void {
  recentlyCreatedReservation = true;
  setTimeout(() => {
    recentlyCreatedReservation = false;
  }, SELF_UPDATE_WINDOW_MS);
}

export function wasReservationSelfCreated(): boolean {
  return recentlyCreatedReservation;
}
