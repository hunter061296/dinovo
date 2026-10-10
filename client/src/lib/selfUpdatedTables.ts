// Tracks table IDs the current screen just changed itself (drag, status click, layout edit) so
// the "table:updated" socket echo for that same change doesn't trigger the remote-update
// highlight — that interaction already has instant local feedback (the optimistic update).
// A plain module-level set (not React state) since it's only ever read once, synchronously,
// inside the socket handler — it doesn't need to drive a render itself.
const recentlySelfUpdated = new Set<string>();

const SELF_UPDATE_WINDOW_MS = 1000;

export function markTableSelfUpdated(tableId: string): void {
  recentlySelfUpdated.add(tableId);
  setTimeout(() => recentlySelfUpdated.delete(tableId), SELF_UPDATE_WINDOW_MS);
}

export function wasTableSelfUpdated(tableId: string): boolean {
  return recentlySelfUpdated.has(tableId);
}
