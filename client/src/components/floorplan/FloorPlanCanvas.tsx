import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from "@dnd-kit/core";
import { api } from "../../lib/api";
import type { RestaurantTable, Section } from "../../lib/tables";
import { snapTablePosition } from "../../lib/floorplanSnap";
import { TableCard } from "./TableCard";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 520;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
// Visual reference grid for the layout editor — 4x SNAP_GRID (see lib/floorplanSnap.ts) so each
// square marks where a dragged table actually snaps, not an arbitrary decoration.
const GRID_SIZE = 40;
const gridBackground = {
  backgroundImage:
    "linear-gradient(to right, var(--color-grid-line) 1px, transparent 1px), " +
    "linear-gradient(to bottom, var(--color-grid-line) 1px, transparent 1px)",
  backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
};

interface Props {
  // All tables, unfiltered — the canvas owns section filtering internally.
  tables: RestaurantTable[];
  sections: Section[] | undefined;
  // Repositioning is only offered from the layout-settings area; the live view is read/status-only.
  draggable: boolean;
  showManageSections: boolean;
  onManageSections?: () => void;
  onTableClick: (table: RestaurantTable) => void;
  seatedGuestByTable?: Map<string, string>;
  upcomingByTable?: Map<string, { time: string; guestName: string; at: number }>;
  emptyMessageNoTables: string;
}

export function FloorPlanCanvas({
  tables,
  sections,
  draggable,
  showManageSections,
  onManageSections,
  onTableClick,
  seatedGuestByTable,
  upcomingByTable,
  emptyMessageNoTables,
}: Props) {
  const queryClient = useQueryClient();

  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Positions of just-dropped tables, held until their save settles — see handleDragEnd.
  const [droppedPositions, setDroppedPositions] = useState<Record<string, { positionX: number; positionY: number }>>({});

  const displayedTables = tables
    .filter((t) => !selectedSectionId || t.sectionId === selectedSectionId)
    .map((t) => (droppedPositions[t.id] ? { ...t, ...droppedPositions[t.id] } : t));
  const selectedSectionName = selectedSectionId ? sections?.find((s) => s.id === selectedSectionId)?.name : "All tables";

  const canvasHeight = Math.max(CANVAS_HEIGHT - 40, ...displayedTables.map((t) => t.positionY + 220), 200);

  // The available drawing area is never big enough to guarantee the canvas fits at 1:1 (a tablet
  // screen, or a floor plan tall enough that its tables extend past CANVAS_HEIGHT) — scale the
  // whole canvas down on both axes so it always fits with no scrolling, rather than force a
  // scrollbar. Manual zoom (below) then multiplies on top of this auto-fit scale.
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [manualZoom, setManualZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const autoFitScale =
    containerSize.width > 0 && containerSize.height > 0
      ? Math.min(1, containerSize.width / CANVAS_WIDTH, containerSize.height / canvasHeight)
      : 1;
  const scale = autoFitScale * manualZoom;

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvasWrapperRef.current?.requestFullscreen();
    }
  }

  // Without an activation distance, dnd-kit's PointerSensor treats every pointerdown as a
  // potential drag and swallows the click event, breaking "click a table for its actions".
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const moveTable = useMutation({
    mutationFn: ({ id, positionX, positionY }: { id: string; positionX: number; positionY: number }) =>
      api.patch(`/tables/${id}`, { positionX, positionY }),
    // No onSettled invalidate here: the server's own "table:updated" socket broadcast already
    // reconciles the cache with the confirmed position. Invalidating on every drop forced an
    // extra full refetch that could resolve after a *later* drag's optimistic update, snapping
    // that table back to its pre-drag position — the glitchy-drag bug.
  });

  // Forces the "grabbing" cursor globally for the duration of a drag (see the .table-dragging
  // rule in index.css) rather than toggling `cursor` on the dragged element itself, which is
  // what triggers a Chrome bug that leaves the cursor invisible after a drag ends.
  function handleDragStart() {
    document.body.classList.add("table-dragging");
  }

  function handleDragCancel() {
    document.body.classList.remove("table-dragging");
  }

  // Pointer movement is in screen pixels, but table positions live in unscaled canvas
  // coordinates — divide out the scale so dragging feels 1:1 even when the canvas is zoomed/shrunk.
  function snappedDropPosition(table: RestaurantTable, dx: number, dy: number) {
    const others = displayedTables.filter((t) => t.id !== table.id);
    return snapTablePosition(table, others, table.positionX + dx / scale, table.positionY + dy / scale, {
      maxX: CANVAS_WIDTH - 60,
      maxY: CANVAS_HEIGHT - 60,
    });
  }

  // Snaps the live drag preview, so the table visibly clicks into alignment while it moves.
  const snapModifier: Modifier = ({ transform, active }) => {
    const table = active && displayedTables.find((t) => t.id === active.id);
    if (!table) return transform;
    const { x, y } = snappedDropPosition(table, transform.x, transform.y);
    return { ...transform, x: (x - table.positionX) * scale, y: (y - table.positionY) * scale };
  };

  function handleDragEnd(event: DragEndEvent) {
    document.body.classList.remove("table-dragging");
    const table = displayedTables.find((t) => t.id === event.active.id);
    if (!table) return;
    // delta already includes snapModifier's output; snapping again is a no-op except when the
    // container auto-scrolled mid-drag, where it re-aligns the final position.
    const { x: nextX, y: nextY } = snappedDropPosition(table, event.delta.x, event.delta.y);

    // dnd-kit drops its drag transform in this same event, so the table's base position must
    // already be the drop location when that commits — otherwise there's one frame at the old
    // position (the snap-back on release). setQueryData alone isn't enough: React Query notifies
    // components on its own scheduler (setTimeout), so that re-render lands a frame late. Plain
    // React state set here is batched into the same commit as dnd-kit's own state update.
    setDroppedPositions((prev) => ({ ...prev, [table.id]: { positionX: nextX, positionY: nextY } }));
    const clearDropped = () =>
      setDroppedPositions((prev) => {
        const { [table.id]: _, ...rest } = prev;
        return rest;
      });

    const previous = queryClient.getQueryData<RestaurantTable[]>(["tables"]);
    queryClient.setQueryData<RestaurantTable[]>(["tables"], (old) =>
      old?.map((t) => (t.id === table.id ? { ...t, positionX: nextX, positionY: nextY } : t))
    );
    moveTable.mutate(
      { id: table.id, positionX: nextX, positionY: nextY },
      {
        onError: () => previous && queryClient.setQueryData(["tables"], previous),
        onSettled: clearDropped,
      }
    );
  }

  return (
    <DndContext
      sensors={sensors}
      modifiers={[snapModifier]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={canvasWrapperRef} className={`relative min-h-0 flex-1 ${isFullscreen ? "bg-white p-4 dark:bg-gray-900" : ""}`}>
        <div
          ref={containerRef}
          // autoFitScale (above) scales the canvas to fit this box on both axes, so it never
          // needs to scroll — deliberately overflow-hidden rather than overflow-auto: a CSS
          // transform: scale() doesn't shrink an element's contribution to scrollWidth/
          // scrollHeight (only its paint), so with overflow-auto the browser still offered a
          // scrollbar for the pre-scale layout box even though nothing was actually clipped.
          className="relative h-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
          style={{
            width: "100%",
            maxWidth: isFullscreen ? undefined : CANVAS_WIDTH + 40,
            height: isFullscreen ? "calc(100vh - 32px)" : "100%",
            padding: 20,
          }}
        >
          <div
            className="relative origin-top-left"
            style={{
              width: CANVAS_WIDTH,
              height: canvasHeight,
              // Grid only shown while editing the layout — the live view has no need for it.
              ...(draggable ? gridBackground : undefined),
              // Only apply the transform when it actually does something. Chrome has a
              // compositing bug where the cursor can render behind (rather than on top of) a
              // descendant of a *transformed* ancestor — including transform: scale(1), a
              // literal no-op — so on a desktop window wide enough that no shrinking is needed
              // (scale === 1, the common case), skip it entirely rather than pay for a broken
              // compositing context for nothing.
              transform: scale !== 1 ? `scale(${scale})` : undefined,
              willChange: scale !== 1 ? "transform" : undefined,
            }}
          >
            {displayedTables.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                {tables.length === 0 ? emptyMessageNoTables : "No tables in this section."}
              </div>
            )}
            {displayedTables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                draggable={draggable}
                scale={scale}
                onClick={() => onTableClick(table)}
                seatedGuestName={seatedGuestByTable?.get(table.id) ?? null}
                upcomingReservation={upcomingByTable?.get(table.id) ?? null}
              />
            ))}
          </div>
        </div>

        {/* Zoom + fullscreen controls — overlaid on canvasWrapperRef (not the scrollable canvas)
            so they stay put in the corner instead of scrolling away when zoomed in. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-col gap-1 rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-700">
            <button
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
              className="border-b border-gray-200 p-2 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M3 3a1 1 0 011-1h4a1 1 0 010 2H5v3a1 1 0 01-2 0V3zm14-1a1 1 0 011 1v4a1 1 0 01-2 0V4h-3a1 1 0 010-2h4zM3 17a1 1 0 001 1h4a1 1 0 000-2H5v-3a1 1 0 00-2 0v4zm14 1a1 1 0 001-1v-4a1 1 0 00-2 0v3h-3a1 1 0 000 2h4z" />
              </svg>
            </button>
            <button
              onClick={() => setManualZoom((z) => Math.min(MAX_ZOOM, z + 0.15))}
              aria-label="Zoom in"
              className="border-b border-gray-200 px-2 py-1 text-lg font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              +
            </button>
            <button
              onClick={() => setManualZoom((z) => Math.max(MIN_ZOOM, z - 0.15))}
              aria-label="Zoom out"
              className="px-2 py-1 text-lg font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              −
            </button>
          </div>

          {/* Section selector */}
          <div className="pointer-events-auto absolute bottom-4 left-4">
            <button
              onClick={() => setSectionMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              {selectedSectionName}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {sectionMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-700">
                <button
                  onClick={() => {
                    setSelectedSectionId(null);
                    setSectionMenuOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-600 ${
                    !selectedSectionId ? "font-semibold text-accent-600" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  All tables
                </button>
                {sections?.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedSectionId(s.id);
                      setSectionMenuOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-600 ${
                      selectedSectionId === s.id ? "font-semibold text-accent-600" : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
                {showManageSections && (
                  <button
                    onClick={() => {
                      setSectionMenuOpen(false);
                      onManageSections?.();
                    }}
                    className="block w-full border-t border-gray-100 px-3 py-1.5 text-left text-sm font-medium text-accent-600 hover:bg-accent-50 dark:border-gray-600 dark:hover:bg-accent-900/30"
                  >
                    Manage sections...
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DndContext>
  );
}
