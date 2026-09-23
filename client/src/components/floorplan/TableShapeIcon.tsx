import type { TableShape } from "../../lib/tables";

// A small table-with-seats glyph per shape, used wherever a host picks or needs to recognize a
// table's shape (currently the TableFormModal shape picker) — reads clearer at a glance than the
// plain "Round/Square/Rectangle" text it replaces.
export function TableShapeIcon({ shape, className = "h-6 w-6" }: { shape: TableShape; className?: string }) {
  if (shape === "ROUND") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="2.4" r="1.5" fill="currentColor" />
        <circle cx="12" cy="21.6" r="1.5" fill="currentColor" />
        <circle cx="2.4" cy="12" r="1.5" fill="currentColor" />
        <circle cx="21.6" cy="12" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "RECTANGLE") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect x="2.5" y="7.5" width="19" height="9" rx="1.5" stroke="currentColor" strokeWidth="2" />
        <rect x="5" y="2.4" width="3.4" height="2.4" rx="0.7" fill="currentColor" />
        <rect x="15.6" y="2.4" width="3.4" height="2.4" rx="0.7" fill="currentColor" />
        <rect x="5" y="19.2" width="3.4" height="2.4" rx="0.7" fill="currentColor" />
        <rect x="15.6" y="19.2" width="3.4" height="2.4" rx="0.7" fill="currentColor" />
      </svg>
    );
  }
  // SQUARE
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="9.3" y="0.8" width="5.4" height="2.4" rx="0.7" fill="currentColor" />
      <rect x="9.3" y="20.8" width="5.4" height="2.4" rx="0.7" fill="currentColor" />
      <rect x="0.8" y="9.3" width="2.4" height="5.4" rx="0.7" fill="currentColor" />
      <rect x="20.8" y="9.3" width="2.4" height="5.4" rx="0.7" fill="currentColor" />
    </svg>
  );
}
