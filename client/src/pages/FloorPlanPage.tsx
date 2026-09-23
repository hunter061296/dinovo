import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from "@dnd-kit/core";
import { AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { getSocket } from "../lib/socket";
import { markTableSelfUpdated, wasTableSelfUpdated } from "../lib/selfUpdatedTables";
import type { RestaurantTable, Section, SeatedSummaryEntry, TableShape } from "../lib/tables";
import type { Reservation } from "../lib/reservations";
import { minutesToLabel } from "../lib/reservations";
import { snapTablePosition } from "../lib/floorplanSnap";
import { TableCard } from "../components/floorplan/TableCard";
import { TableFormModal } from "../components/floorplan/TableFormModal";
import { TableStatusPopover } from "../components/floorplan/TableStatusPopover";
import { SectionManagerModal } from "../components/floorplan/SectionManagerModal";
import { FloorPlanSidePanel } from "../components/floorplan/FloorPlanSidePanel";
import { Skeleton } from "../components/Skeleton";

// Mirrors the real layout's side panel (tabs + a few rows) and canvas (a scatter of round/square
// table outlines) so the page reads as "already rendering" rather than blank-then-pop.
function FloorPlanSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="w-full shrink-0 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:w-72">
        <div className="mb-3 flex gap-2">
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 flex-1" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap gap-6">
          {[
            "h-16 w-16 rounded-full",
            "h-16 w-16 rounded-full",
            "h-16 w-20 rounded-lg",
            "h-16 w-16 rounded-full",
            "h-16 w-24 rounded-lg",
            "h-16 w-16 rounded-full",
            "h-16 w-20 rounded-lg",
            "h-16 w-16 rounded-full",
          ].map((shape, i) => (
            <Skeleton key={i} className={shape} />
          ))}
        </div>
      </div>
    </div>
  );
}

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 520;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

export function FloorPlanPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const queryClient = useQueryClient();

  const { data: tables, isLoading, isError } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["sections"],
    queryFn: () => api.get("/sections").then((res) => res.data),
  });

  // Feeds the guest-name/upcoming-reservation badges drawn directly on each TableCard — shares a
  // cache key with FloorPlanSidePanel's own queries, so this doesn't add an extra network round trip.
  const today = todayLocalISODate();
  const { data: todaysReservations } = useQuery<Reservation[]>({
    queryKey: ["reservations", today],
    queryFn: () => api.get("/reservations", { params: { date: today } }).then((res) => res.data),
  });
  const { data: seatedSummary } = useQuery<SeatedSummaryEntry[]>({
    queryKey: ["tables", "seated-summary"],
    queryFn: () => api.get("/tables/seated-summary").then((res) => res.data),
    refetchInterval: 30_000,
  });

  const [formModal, setFormModal] = useState<"add" | RestaurantTable | null>(null);
  const [statusTable, setStatusTable] = useState<RestaurantTable | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Positions of just-dropped tables, held until their save settles — see handleDragEnd.
  const [droppedPositions, setDroppedPositions] = useState<Record<string, { positionX: number; positionY: number }>>({});

  const displayedTables = (tables ?? [])
    .filter((t) => !selectedSectionId || t.sectionId === selectedSectionId)
    .map((t) => (droppedPositions[t.id] ? { ...t, ...droppedPositions[t.id] } : t));
  const selectedSectionName = selectedSectionId ? sections?.find((s) => s.id === selectedSectionId)?.name : "All tables";

  const seatedGuestByTable = new Map(
    (seatedSummary ?? []).map((e) => [e.tableId, e.guestName ?? "Walk-in"] as const)
  );

  // Soonest not-yet-seated reservation per table, so an OPEN table can show "who's coming next".
  const upcomingByTable = new Map<string, { time: string; guestName: string; at: number }>();
  for (const r of todaysReservations ?? []) {
    if (r.status !== "BOOKED" || !r.tableId) continue;
    const at = new Date(r.dateTime).getTime();
    const existing = upcomingByTable.get(r.tableId);
    if (existing && existing.at <= at) continue;
    const dt = new Date(r.dateTime);
    upcomingByTable.set(r.tableId, {
      at,
      time: minutesToLabel(dt.getHours() * 60 + dt.getMinutes()),
      guestName: `${r.guest.firstName} ${r.guest.lastName}`,
    });
  }

  // On a tablet-width screen the 900px canvas is wider than the viewport — rather than force
  // horizontal scrolling to see the rest of the floor plan, scale the whole canvas down to fit.
  // Manual zoom (below) then multiplies on top of this auto-fit scale.
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [autoFitScale, setAutoFitScale] = useState(1);
  const [manualZoom, setManualZoom] = useState(1);
  const scale = autoFitScale * manualZoom;
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setAutoFitScale(Math.min(1, entry.contentRect.width / CANVAS_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
    // `tables` starts undefined while the query is loading, and the ref-bearing div only
    // renders once it resolves — re-run so the observer actually attaches once that div exists.
  }, [tables]);

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

  // Briefly highlighted tables — a table:updated arrived for them from somewhere other than this
  // screen's own action, so a host looking at the floor plan notices something just changed.
  const [remoteHighlights, setRemoteHighlights] = useState<Set<string>>(new Set());

  // Keeps every open host-stand screen in sync — a status change made on one iPad shows up
  // on all the others without anyone refreshing.
  useEffect(() => {
    const socket = getSocket();
    const upsert = (table: RestaurantTable) => {
      queryClient.setQueryData<RestaurantTable[]>(["tables"], (old) => {
        if (!old) return old;
        const exists = old.some((t) => t.id === table.id);
        return exists ? old.map((t) => (t.id === table.id ? table : t)) : [...old, table].sort((a, b) => a.number - b.number);
      });
      queryClient.invalidateQueries({ queryKey: ["tables", "seated-summary"] });
    };
    const remove = ({ id }: { id: string }) => {
      queryClient.setQueryData<RestaurantTable[]>(["tables"], (old) => old?.filter((t) => t.id !== id));
    };
    const remoteUpdate = (table: RestaurantTable) => {
      upsert(table);
      if (wasTableSelfUpdated(table.id)) return;
      setRemoteHighlights((prev) => new Set(prev).add(table.id));
      setTimeout(() => {
        setRemoteHighlights((prev) => {
          if (!prev.has(table.id)) return prev;
          const next = new Set(prev);
          next.delete(table.id);
          return next;
        });
      }, 600);
    };
    // A brand-new table has nothing local to compare against — never highlight table:created.
    socket.on("table:created", upsert);
    socket.on("table:updated", remoteUpdate);
    socket.on("table:deleted", remove);
    return () => {
      socket.off("table:created", upsert);
      socket.off("table:updated", remoteUpdate);
      socket.off("table:deleted", remove);
    };
  }, [queryClient]);

  // Without an activation distance, dnd-kit's PointerSensor treats every pointerdown as a
  // potential drag and swallows the click event, breaking "click a table for its actions".
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const moveTable = useMutation({
    mutationFn: ({ id, positionX, positionY }: { id: string; positionX: number; positionY: number }) =>
      api.patch(`/tables/${id}`, { positionX, positionY }),
    // No onSettled invalidate here: the server's own "table:updated" socket broadcast (handled by
    // the effect above) already reconciles the cache with the confirmed position. Invalidating on
    // every drop forced an extra full refetch that could resolve after a *later* drag's optimistic
    // update, snapping that table back to its pre-drag position — the glitchy-drag bug.
    // Optimistic update and rollback live in handleDragEnd instead of onMutate (see there).
  });

  const createTable = useMutation({
    mutationFn: (data: { number: number; capacity: number; shape: TableShape; sectionId: string | null }) => {
      // Drop new tables below the existing layout so they never spawn stacked on top of one another.
      const maxY = tables?.length ? Math.max(...tables.map((t) => t.positionY)) : 0;
      return api.post("/tables", { ...data, positionX: 40, positionY: tables?.length ? maxY + 140 : 40 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      setFormModal(null);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to create table"),
  });

  const updateTable = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { number: number; capacity: number; shape: TableShape; sectionId: string | null } }) =>
      api.patch(`/tables/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      setFormModal(null);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to update table"),
  });

  const deleteTable = useMutation({
    mutationFn: (id: string) => api.delete(`/tables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      setFormModal(null);
    },
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

    markTableSelfUpdated(table.id);
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Floor Plan</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Click a table to change its status.{" "}
            {canEdit ? "Drag to reposition, or use Add table to edit the layout." : "Layout changes require a Manager or Admin."}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setFormModal("add")}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
          >
            Add table
          </button>
        )}
      </div>

      {isLoading && <FloorPlanSkeleton />}
      {isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load the floor plan.</div>}

      {tables && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <FloorPlanSidePanel />

          {/* No restrictToParentElement modifier here — it measures the parent's scaled screen
              rect, which doesn't line up with the child's own (unscaled) transform space once the
              canvas is zoomed/shrunk. handleDragEnd already clamps to canvas bounds on drop. */}
          <DndContext
            sensors={sensors}
            modifiers={[snapModifier]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {(() => {
              const canvasHeight = Math.max(CANVAS_HEIGHT - 40, ...displayedTables.map((t) => t.positionY + 220), 200);
              return (
                <div ref={canvasWrapperRef} className={`relative flex-1 ${isFullscreen ? "bg-white p-4 dark:bg-gray-900" : ""}`}>
                  <div
                    ref={containerRef}
                    className="relative overflow-auto rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                    style={{
                      width: "100%",
                      maxWidth: isFullscreen ? undefined : CANVAS_WIDTH + 40,
                      height: isFullscreen ? "calc(100vh - 32px)" : Math.min(canvasHeight, 640) + 40,
                      padding: 20,
                    }}
                  >
                    <div
                      className="relative origin-top-left"
                      style={{
                        width: CANVAS_WIDTH,
                        height: canvasHeight,
                        // Only apply the transform when it actually does something. Chrome has a
                        // compositing bug where the cursor can render behind (rather than on top
                        // of) a descendant of a *transformed* ancestor — including transform:
                        // scale(1), a literal no-op — so on a desktop window wide enough that no
                        // shrinking is needed (scale === 1, the common case), skip it entirely
                        // rather than pay for a broken compositing context for nothing.
                        transform: scale !== 1 ? `scale(${scale})` : undefined,
                        willChange: scale !== 1 ? "transform" : undefined,
                      }}
                    >
                      {displayedTables.length === 0 && (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                          {tables.length === 0
                            ? canEdit
                              ? 'No tables yet. Click "Add table" to build your floor plan.'
                              : "No tables yet."
                            : "No tables in this section."}
                        </div>
                      )}
                      {displayedTables.map((table) => (
                        <TableCard
                          key={table.id}
                          table={table}
                          draggable={canEdit}
                          scale={scale}
                          onClick={() => setStatusTable(table)}
                          seatedGuestName={seatedGuestByTable.get(table.id) ?? null}
                          upcomingReservation={upcomingByTable.get(table.id) ?? null}
                          remoteHighlight={remoteHighlights.has(table.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Zoom + fullscreen controls — overlaid on canvasWrapperRef (not the scrollable
                      canvas) so they stay put in the corner instead of scrolling away when zoomed in. */}
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
                          {canEdit && (
                            <button
                              onClick={() => {
                                setSectionMenuOpen(false);
                                setSectionManagerOpen(true);
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
              );
            })()}
          </DndContext>
        </div>

      )}

      <AnimatePresence>
        {statusTable && (
          <TableStatusPopover
            key="status-popover"
            table={tables?.find((t) => t.id === statusTable.id) ?? statusTable}
            canEditLayout={canEdit}
            onEditLayout={() => {
              setFormModal(statusTable);
              setStatusTable(null);
            }}
            onClose={() => setStatusTable(null)}
          />
        )}

        {formModal && (
          <TableFormModal
            key="table-form"
            initial={formModal === "add" ? undefined : formModal}
            sections={sections ?? []}
            submitting={createTable.isPending || updateTable.isPending}
            error={formError}
            onClose={() => {
              setFormModal(null);
              setFormError(null);
            }}
            onSubmit={(data) => {
              if (formModal === "add") createTable.mutate(data);
              else {
                markTableSelfUpdated(formModal.id);
                updateTable.mutate({ id: formModal.id, data });
              }
            }}
            onDelete={
              formModal !== "add"
                ? () => {
                    if (confirm(`Delete table ${formModal.number}? This cannot be undone.`)) {
                      deleteTable.mutate(formModal.id);
                    }
                  }
                : undefined
            }
          />
        )}

        {sectionManagerOpen && <SectionManagerModal key="section-manager" sections={sections ?? []} onClose={() => setSectionManagerOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
