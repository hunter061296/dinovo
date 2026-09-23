import { tableSize, type RestaurantTable } from "./tables";

// Canvas pixels. A dragged table snaps into line with another table (left/center/right edges,
// or top/middle/bottom) when within ALIGN_THRESHOLD; otherwise it snaps to the grid.
export const SNAP_GRID = 10;
const ALIGN_THRESHOLD = 8;

type Box = Pick<RestaurantTable, "positionX" | "positionY" | "capacity" | "shape">;

// [start, middle, end] of a box along one axis. Only like anchors are matched (center to center,
// edge to same edge), which is more predictable than aligning one table's center to another's edge.
function anchors(start: number, length: number) {
  return [start, start + length / 2, start + length];
}

function snapAxis(value: number, length: number, others: { start: number; length: number }[]) {
  const own = anchors(value, length);
  let best: { diff: number; line: number } | null = null;
  for (const o of others) {
    const theirs = anchors(o.start, o.length);
    // Prefer the center when several anchors line up at once (same-size tables in a row).
    for (const i of [1, 0, 2]) {
      const diff = theirs[i] - own[i];
      if (Math.abs(diff) <= ALIGN_THRESHOLD && (!best || Math.abs(diff) < Math.abs(best.diff))) {
        best = { diff, line: theirs[i] };
      }
    }
  }
  return best ? { value: value + best.diff, guide: best.line } : { value: Math.round(value / SNAP_GRID) * SNAP_GRID, guide: null };
}

export function snapTablePosition(table: Box, others: Box[], x: number, y: number, bounds: { maxX: number; maxY: number }) {
  const { width, height } = tableSize(table.capacity, table.shape);
  const sizes = others.map((o) => ({ o, s: tableSize(o.capacity, o.shape) }));
  const sx = snapAxis(x, width, sizes.map(({ o, s }) => ({ start: o.positionX, length: s.width })));
  const sy = snapAxis(y, height, sizes.map(({ o, s }) => ({ start: o.positionY, length: s.height })));
  const cx = Math.max(0, Math.min(bounds.maxX, sx.value));
  const cy = Math.max(0, Math.min(bounds.maxY, sy.value));
  return {
    x: cx,
    y: cy,
    // A guide is only accurate if clamping to the canvas didn't move the table off the line.
    guideX: cx === sx.value ? sx.guide : null,
    guideY: cy === sy.value ? sy.guide : null,
  };
}
