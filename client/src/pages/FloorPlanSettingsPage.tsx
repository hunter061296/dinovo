import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import type { RestaurantTable, Section, TableShape } from "../lib/tables";
import { TableFormModal } from "../components/floorplan/TableFormModal";
import { SectionManagerModal } from "../components/floorplan/SectionManagerModal";
import { FloorPlanCanvas } from "../components/floorplan/FloorPlanCanvas";

export function FloorPlanSettingsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const { data: tables, isLoading, isError } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["sections"],
    queryFn: () => api.get("/sections").then((res) => res.data),
  });

  const [formModal, setFormModal] = useState<"add" | RestaurantTable | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);

  // Deep-link from the live Floor Plan's "Edit table layout" action (see FloorPlanPage) — opens
  // straight to that table's edit form instead of requiring a second click here.
  useEffect(() => {
    const tableId = searchParams.get("table");
    if (!tableId || !tables) return;
    const table = tables.find((t) => t.id === tableId);
    if (table) setFormModal(table);
  }, [searchParams, tables]);

  // Keeps this screen in sync if another Manager/Admin is editing the layout at the same time.
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-400 dark:text-gray-500">
            <Link to="/floor-plan" className="hover:underline">
              Floor Plan
            </Link>
            <span>/</span>
            <span>Availability Planning</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Floor plan settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Drag to reposition, or use Add table to edit the layout.</p>
        </div>
        <button
          onClick={() => setFormModal("add")}
          className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          Add table
        </button>
      </div>

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading floor plan...</div>}
      {isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load the floor plan.</div>}

      {tables && (
        <FloorPlanCanvas
          tables={tables}
          sections={sections}
          draggable
          showManageSections
          onManageSections={() => setSectionManagerOpen(true)}
          onTableClick={setFormModal}
          emptyMessageNoTables='No tables yet. Click "Add table" to build your floor plan.'
        />
      )}

      <AnimatePresence>
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

        {sectionManagerOpen && <SectionManagerModal key="section-manager" sections={sections ?? []} onClose={() => setSectionManagerOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
