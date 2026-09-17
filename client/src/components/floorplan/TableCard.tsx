import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { RestaurantTable } from "../../lib/tables";

const STATUS_STYLES: Record<RestaurantTable["status"], string> = {
  OPEN: "bg-white border-gray-300 text-gray-700",
  SEATED: "bg-blue-100 border-blue-400 text-blue-800",
  ORDERED: "bg-amber-100 border-amber-400 text-amber-800",
  NEEDS_CLEANING: "bg-red-100 border-red-400 text-red-800",
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
}

export function TableCard({ table, draggable, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: table.id,
    disabled: !draggable,
  });
  const { width, height } = sizeFor(table.capacity, table.shape);

  const style: React.CSSProperties = {
    position: "absolute",
    left: table.positionX,
    top: table.positionY,
    width,
    height,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex flex-col items-center justify-center border-2 text-sm font-medium shadow-sm transition-shadow hover:shadow-md ${
        table.shape === "ROUND" ? "rounded-full" : "rounded-lg"
      } ${STATUS_STYLES[table.status]} ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      {...listeners}
      {...attributes}
    >
      <span className="font-semibold">#{table.number}</span>
      <span className="text-xs opacity-75">{table.capacity} seats</span>
    </button>
  );
}
