// One <select> value covers both kinds of assignment: "" (unassigned), "t:<tableId>", or
// "c:<combinationId>". Keeps every form's state a single string.
export function encodeAssignment(r: { tableId: string | null; combinationId: string | null } | undefined): string {
  if (r?.combinationId) return `c:${r.combinationId}`;
  if (r?.tableId) return `t:${r.tableId}`;
  return "";
}

// The request fields for an encoded assignment. Picking a single table always sends
// `combinationId: null`, so switching off a combination actually clears it server-side.
export function decodeAssignment(value: string): { tableId?: string | null; combinationId: string | null } {
  if (value.startsWith("c:")) return { combinationId: value.slice(2) };
  if (value.startsWith("t:")) return { tableId: value.slice(2), combinationId: null };
  return { tableId: null, combinationId: null };
}
