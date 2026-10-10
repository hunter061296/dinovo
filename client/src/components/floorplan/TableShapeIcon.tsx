import { SEAT_GAP, SEAT_THICKNESS, seatLayout, tableSize, type TableShape } from "../../lib/tables";

// Drawn from the same seatLayout() as the floor plan's TableCard, at a representative seat count,
// so the shape picker previews exactly what a table will look like on the canvas.
const PREVIEW_CAPACITY: Record<TableShape, number> = { ROUND: 4, SQUARE: 4, RECTANGLE: 6 };

export function TableShapeIcon({ shape, className = "h-6 w-6" }: { shape: TableShape; className?: string }) {
  const capacity = PREVIEW_CAPACITY[shape];
  const { width, height } = tableSize(capacity, shape);
  const pad = SEAT_GAP + SEAT_THICKNESS + 2;

  return (
    <svg viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`} className={className} aria-hidden="true">
      {shape === "ROUND" ? (
        <circle cx={width / 2} cy={height / 2} r={width / 2} fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ) : (
        <rect width={width} height={height} rx={6} fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      )}
      {seatLayout(capacity, shape).map((seat, i) => (
        <rect
          key={i}
          x={seat.cx - seat.length / 2}
          y={seat.cy - seat.thickness / 2}
          width={seat.length}
          height={seat.thickness}
          rx={1.5}
          fill="currentColor"
          transform={`rotate(${seat.angle} ${seat.cx} ${seat.cy})`}
        />
      ))}
    </svg>
  );
}
