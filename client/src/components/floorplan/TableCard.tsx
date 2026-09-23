import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { RestaurantTable } from "../../lib/tables";

const STATUS_STYLES: Record<RestaurantTable["status"], string> = {
  OPEN: "bg-white border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200",
  SEATED: "bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300",
  ORDERED: "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/40 dark:border-amber-600 dark:text-amber-300",
  NEEDS_CLEANING: "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/40 dark:border-red-600 dark:text-red-300",
};

function sizeFor(capacity: number, shape: RestaurantTable["shape"]) {
  const base = Math.min(56 + capacity * 4, 140);
  if (shape === "RECTANGLE") return { width: base * 1.6, height: base * 0.8 };
  return { width: base, height: base };
}

interface Props {
  table: RestaurantTable;
  draggable: boolean;
  onClick?: () => void;
  // The canvas may be CSS-scaled down to fit a tablet-width screen (see FloorPlanPage). dnd-kit's
  // translate is in real screen pixels, which the ancestor's scale() would otherwise compress —
  // so we inflate it here to cancel that out and keep the drag tracking the cursor 1:1.
  scale?: number;
  // Who's currently in the seat, when table.status === "SEATED".
  seatedGuestName?: string | null;
  // The soonest upcoming reservation for this table today, when table.status === "OPEN" — lets a
  // host see at a glance which open tables already have a party coming in.
  upcomingReservation?: { time: string; guestName: string } | null;
}

export function TableCard({ table, draggable, onClick, scale = 1, seatedGuestName, upcomingReservation }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: table.id,
    disabled: !draggable,
  });
  const { width, height } = sizeFor(table.capacity, table.shape);

  const adjustedTransform = transform && scale !== 1 ? { ...transform, x: transform.x / scale, y: transform.y / scale } : transform;

  const style: React.CSSProperties = {
    position: "absolute",
    left: table.positionX,
    top: table.positionY,
    width,
    height,
    transform: CSS.Translate.toString(adjustedTransform),
    zIndex: isDragging ? 10 : 1,
    // Required by dnd-kit's PointerSensor: without it, the browser's own touch/pointer gesture
    // handling fights the drag on every move, which is what caused both the jittery dragging and
    // the cursor sometimes vanishing mid-drag.
    touchAction: draggable ? "none" : undefined,
    willChange: isDragging ? "transform" : undefined,
    // Static, not toggled by isDragging: Chrome has a bug where dynamically changing `cursor` on
    // an element that currently has pointer capture (dnd-kit uses setPointerCapture for every
    // drag) can leave the cursor invisible after the drag ends. The "grabbing" cursor during an
    // active drag is instead forced globally via the .table-dragging class in index.css.
    cursor: draggable ? "grab" : "pointer",
  };

  const showsReservationBadge = table.status === "OPEN" && !!upcomingReservation;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex flex-col items-center justify-center border-2 px-1 text-sm font-medium shadow-sm transition-shadow hover:shadow-md ${
        table.shape === "ROUND" ? "rounded-full" : "rounded-lg"
      } ${STATUS_STYLES[table.status]} ${showsReservationBadge ? "ring-2 ring-amber-400 dark:ring-amber-500" : ""}`}
      {...(draggable ? { ...listeners, ...attributes } : {})}
    >
      <span className="font-semibold">#{table.number}</span>
      {table.status === "SEATED" && seatedGuestName ? (
        <span className="max-w-full truncate text-xs opacity-75">{seatedGuestName}</span>
      ) : showsReservationBadge ? (
        <span className="max-w-full truncate text-xs opacity-75">{upcomingReservation!.time}</span>
      ) : (
        <span className="text-xs opacity-75">{table.capacity} seats</span>
      )}
    </button>
  );
}
