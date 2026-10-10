import type { Reservation } from "./reservations";
import { minutesToLabel } from "./reservations";
import { TABLE_STATUS_LABELS } from "./tables";

export interface PrintRow {
  time: string;
  partySize: string;
  guestName: string;
  table: string;
  notesAndTags: string;
  tableStatus: string;
  made: string;
}

const NOTE_EXCERPT_LENGTH = 60;

// First non-empty structured note (see Phase 2's ReservationFormModal), truncated for a
// one-line printed row — the full text is still visible in the reservation detail panel.
function noteExcerpt(r: Reservation): string {
  const note = r.generalNote || r.offerNote || r.foodDrinkNote || r.seatingNote;
  if (!note) return "";
  return note.length > NOTE_EXCERPT_LENGTH ? `${note.slice(0, NOTE_EXCERPT_LENGTH).trimEnd()}…` : note;
}

export function toPrintRow(r: Reservation): PrintRow {
  const dt = new Date(r.dateTime);
  const notesAndTags = [r.tags.join(", "), noteExcerpt(r)].filter(Boolean).join(" — ");

  return {
    time: minutesToLabel(dt.getHours() * 60 + dt.getMinutes()),
    partySize: r.partySize.toString(),
    guestName: `${r.guest.firstName} ${r.guest.lastName}`,
    table: r.table ? `Table ${r.table.number}` : "Unassigned",
    notesAndTags: notesAndTags || "—",
    tableStatus: r.table ? TABLE_STATUS_LABELS[r.table.status] : "—",
    // "Made" = when the reservation was booked (createdAt), not the reservation's own date/time.
    made: new Date(r.createdAt).toLocaleDateString(),
  };
}

export const PRINT_COLUMNS: { key: keyof PrintRow; label: string }[] = [
  { key: "time", label: "Time" },
  { key: "partySize", label: "Party size" },
  { key: "guestName", label: "Guest name" },
  { key: "table", label: "Table" },
  { key: "notesAndTags", label: "Notes and tags" },
  { key: "tableStatus", label: "Table status" },
  { key: "made", label: "Made" },
];

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: PrintRow[]): string {
  const header = PRINT_COLUMNS.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) => PRINT_COLUMNS.map((c) => csvEscape(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
