import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { seatLayout, tableSize, type RestaurantTable } from "../../lib/tables";

// Chairs are positioned relative to the body's outer edge, but absolute children of the button
// are laid out from inside its border-2 — subtract it so chairs line up with the visible edge.
const BORDER_PX = 2;

const STATUS_STYLES: Record<RestaurantTable["status"], string> = {
  OPEN: "bg-white border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200",
  SEATED: "bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300",
  ORDERED: "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/40 dark:border-amber-600 dark:text-amber-300",
  NEEDS_CLEANING: "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/40 dark:border-red-600 dark:text-red-300",
};

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
  const { width, height } = tableSize(table.capacity, table.shape);

  const adjustedTransform = transform && scale !== 1 ? { ...transform, x: transform.x / scale, y: transform.y / scale } : transform;

  const style: React.CSSProperties = {
    position: "absolute",
    left: table.positionX,
    top: table.positionY,
    width,
    height,
    transform: CSS.Translate.toString(adjustedTransform),
    zIndex: isDragging ? 10 : 1,
    // dnd-kit's PointerSensor needs this so touch scrolling doesn't fight the drag.
    touchAction: draggable ? "none" : undefined,
    willChange: isDragging ? "transform" : undefined,
    // Cursor comes from the cursor-table-grab class (index.css), not inline style.
  };

  const showsReservationBadge = table.status === "OPEN" && !!upcomingReservation;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex flex-col items-center justify-center border-2 px-1 text-sm font-medium shadow-sm transition-shadow hover:shadow-md ${
        draggable ? "cursor-table-grab" : "cursor-pointer"
      } ${table.shape === "ROUND" ? "rounded-full" : "rounded-lg"} ${STATUS_STYLES[table.status]} ${
        showsReservationBadge ? "ring-2 ring-amber-400 dark:ring-amber-500" : ""
      }`}
      {...(draggable ? { ...listeners, ...attributes } : {})}
    >
      {seatLayout(table.capacity, table.shape).map((seat, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute rounded-sm bg-gray-600 dark:bg-gray-400"
          style={{
            left: seat.cx - BORDER_PX,
            top: seat.cy - BORDER_PX,
            width: seat.length,
            height: seat.thickness,
            transform: `translate(-50%, -50%) rotate(${seat.angle}deg)`,
          }}
        />
      ))}
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
