import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { RestaurantTable, TableShape } from "../lib/tables";
import { TableCard } from "../components/floorplan/TableCard";
import { TableFormModal } from "../components/floorplan/TableFormModal";

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

  const [modal, setModal] = useState<"add" | RestaurantTable | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Without an activation distance, dnd-kit's PointerSensor treats every pointerdown as a
  // potential drag and swallows the click event, breaking "click a table to edit it".
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
      setModal(null);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to create table"),
  });

  const updateTable = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { number: number; capacity: number; shape: TableShape } }) =>
      api.patch(`/tables/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      setModal(null);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to update table"),
  });

  const deleteTable = useMutation({
    mutationFn: (id: string) => api.delete(`/tables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      setModal(null);
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const table = tables?.find((t) => t.id === event.active.id);
    if (!table) return;
    const nextX = Math.max(0, Math.min(CANVAS_WIDTH - 60, table.positionX + event.delta.x));
    const nextY = Math.max(0, Math.min(CANVAS_HEIGHT - 60, table.positionY + event.delta.y));
    moveTable.mutate({ id: table.id, positionX: nextX, positionY: nextY });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Floor Plan</h1>
          <p className="text-sm text-gray-500">
            {canEdit ? "Drag tables to reposition. Click a table to edit or remove it." : "Read-only view of the current floor plan."}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModal("add")}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add table
          </button>
        )}
      </div>

      {isLoading && <div className="text-sm text-gray-500">Loading floor plan...</div>}
      {isError && <div className="text-sm text-red-600">Failed to load the floor plan.</div>}

      {tables && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={[restrictToParentElement]}>
          <div
            className="relative overflow-auto rounded-lg border border-gray-200 bg-gray-50"
            style={{ width: "100%", maxWidth: CANVAS_WIDTH + 40, height: CANVAS_HEIGHT, padding: 20 }}
          >
            <div
              className="relative"
              style={{
                width: CANVAS_WIDTH,
                height: Math.max(CANVAS_HEIGHT - 40, ...tables.map((t) => t.positionY + 220), 200),
              }}
            >
              {tables.length === 0 && (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  No tables yet. {canEdit && 'Click "Add table" to build your floor plan.'}
                </div>
              )}
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  draggable={canEdit}
                  onClick={canEdit ? () => setModal(table) : undefined}
                />
              ))}
            </div>
          </div>
        </DndContext>
      )}

      {modal && (
        <TableFormModal
          initial={modal === "add" ? undefined : modal}
          submitting={createTable.isPending || updateTable.isPending}
          error={formError}
          onClose={() => {
            setModal(null);
            setFormError(null);
          }}
          onSubmit={(data) => {
            if (modal === "add") createTable.mutate(data);
            else updateTable.mutate({ id: modal.id, data });
          }}
          onDelete={
            modal !== "add"
              ? () => {
                  if (confirm(`Delete table ${modal.number}? This cannot be undone.`)) {
                    deleteTable.mutate(modal.id);
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
