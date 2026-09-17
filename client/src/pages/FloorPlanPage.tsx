import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { getSocket } from "../lib/socket";
import type { RestaurantTable, TableShape } from "../lib/tables";
import { TableCard } from "../components/floorplan/TableCard";
import { TableFormModal } from "../components/floorplan/TableFormModal";
import { TableStatusPopover } from "../components/floorplan/TableStatusPopover";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 520;

export function FloorPlanPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const queryClient = useQueryClient();

  const { data: tables, isLoading, isError } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const [formModal, setFormModal] = useState<"add" | RestaurantTable | null>(null);
  const [statusTable, setStatusTable] = useState<RestaurantTable | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // On a tablet-width screen the 900px canvas is wider than the viewport — rather than force
  // horizontal scrolling to see the rest of the floor plan, scale the whole canvas down to fit.
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / CANVAS_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
    // `tables` starts undefined while the query is loading, and the ref-bearing div only
    // renders once it resolves — re-run so the observer actually attaches once that div exists.
  }, [tables]);

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
    };
    const remove = ({ id }: { id: string }) => {
      queryClient.setQueryData<RestaurantTable[]>(["tables"], (old) => old?.filter((t) => t.id !== id));
    };
    socket.on("table:created", upsert);
    socket.on("table:updated", upsert);
    socket.on("table:deleted", remove);
    return () => {
      socket.off("table:created", upsert);
      socket.off("table:updated", upsert);
      socket.off("table:deleted", remove);
    };
  }, [queryClient]);

  // Without an activation distance, dnd-kit's PointerSensor treats every pointerdown as a
  // potential drag and swallows the click event, breaking "click a table for its actions".
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const moveTable = useMutation({
    mutationFn: ({ id, positionX, positionY }: { id: string; positionX: number; positionY: number }) =>
      api.patch(`/tables/${id}`, { positionX, positionY }),
    // Optimistic update so the drag feels instant instead of snapping back while the request is in flight.
    onMutate: async ({ id, positionX, positionY }) => {
      await queryClient.cancelQueries({ queryKey: ["tables"] });
      const previous = queryClient.getQueryData<RestaurantTable[]>(["tables"]);
      queryClient.setQueryData<RestaurantTable[]>(["tables"], (old) =>
        old?.map((t) => (t.id === id ? { ...t, positionX, positionY } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["tables"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tables"] }),
  });

  const createTable = useMutation({
    mutationFn: (data: { number: number; capacity: number; shape: TableShape }) => {
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
    mutationFn: ({ id, data }: { id: string; data: { number: number; capacity: number; shape: TableShape } }) =>
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

  function handleDragEnd(event: DragEndEvent) {
    const table = tables?.find((t) => t.id === event.active.id);
    if (!table) return;
    // Pointer movement is in screen pixels, but table positions live in unscaled canvas
    // coordinates — divide out the scale so dragging feels 1:1 even when the canvas is shrunk.
    const nextX = Math.max(0, Math.min(CANVAS_WIDTH - 60, table.positionX + event.delta.x / scale));
    const nextY = Math.max(0, Math.min(CANVAS_HEIGHT - 60, table.positionY + event.delta.y / scale));
    moveTable.mutate({ id: table.id, positionX: nextX, positionY: nextY });
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

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading floor plan...</div>}
      {isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load the floor plan.</div>}

      {/* No restrictToParentElement modifier here — it measures the parent's scaled screen rect,
          which doesn't line up with the child's own (unscaled) transform space once the canvas
          is shrunk to fit a tablet. handleDragEnd already clamps to canvas bounds on drop. */}
      {tables && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {(() => {
            const canvasHeight = Math.max(CANVAS_HEIGHT - 40, ...tables.map((t) => t.positionY + 220), 200);
            return (
              <div
                ref={containerRef}
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                style={{ width: "100%", maxWidth: CANVAS_WIDTH + 40, height: canvasHeight * scale + 40, padding: 20 }}
              >
                <div
                  className="relative origin-top-left"
                  style={{ width: CANVAS_WIDTH, height: canvasHeight, transform: `scale(${scale})` }}
                >
                  {tables.length === 0 && (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                      No tables yet. {canEdit && 'Click "Add table" to build your floor plan.'}
                    </div>
                  )}
                  {tables.map((table) => (
                    <TableCard key={table.id} table={table} draggable={canEdit} scale={scale} onClick={() => setStatusTable(table)} />
                  ))}
                </div>
              </div>
            );
          })()}
        </DndContext>
      )}

      {statusTable && (
        <TableStatusPopover
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
          initial={formModal === "add" ? undefined : formModal}
          submitting={createTable.isPending || updateTable.isPending}
          error={formError}
          onClose={() => {
            setFormModal(null);
            setFormError(null);
          }}
          onSubmit={(data) => {
            if (formModal === "add") createTable.mutate(data);
            else updateTable.mutate({ id: formModal.id, data });
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
    </div>
  );
}
