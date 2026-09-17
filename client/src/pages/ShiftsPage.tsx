import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Shift } from "../lib/reservations";
import { DAY_NAMES } from "../lib/pacing";
import { minutesToLabel } from "../lib/reservations";
import { ShiftFormModal, type ShiftFormValues } from "../components/shifts/ShiftFormModal";
import { PacingEditor } from "../components/shifts/PacingEditor";

export function ShiftsPage() {
  const queryClient = useQueryClient();
  const { data: shifts, isLoading, isError } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: () => api.get("/shifts").then((res) => res.data),
  });

  const [formModal, setFormModal] = useState<"add" | Shift | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const createShift = useMutation({
    mutationFn: (values: ShiftFormValues) => api.post("/shifts", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setFormModal(null);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to create shift"),
  });

  const updateShift = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ShiftFormValues }) => api.patch(`/shifts/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setFormModal(null);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to update shift"),
  });

  const deleteShift = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setFormModal(null);
    },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Shifts & Pacing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Define shifts and per-slot cover/party-size caps.</p>
        </div>
        <button
          onClick={() => setFormModal("add")}
          className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          Add shift
        </button>
      </div>

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading shifts...</div>}
      {isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load shifts.</div>}

      {shifts && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {shifts.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">No shifts configured yet.</div>
          ) : (
            shifts.map((shift) => (
              <div key={shift.id} className="border-t border-gray-100 dark:border-gray-700 first:border-t-0">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{shift.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {DAY_NAMES[shift.dayOfWeek]} · {minutesToLabel(shift.startMinutes)} – {minutesToLabel(shift.endMinutes)} ·{" "}
                      {shift.pacingRules.length} slot{shift.pacingRules.length === 1 ? "" : "s"} capped
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setExpanded(expanded === shift.id ? null : shift.id)}
                      className="text-xs font-medium text-accent-600 hover:underline"
                    >
                      {expanded === shift.id ? "Hide pacing" : "Edit pacing"}
                    </button>
                    <button onClick={() => setFormModal(shift)} className="text-xs font-medium text-gray-600 hover:underline dark:text-gray-400">
                      Edit shift
                    </button>
                  </div>
                </div>
                {expanded === shift.id && <PacingEditor shift={shift} />}
              </div>
            ))
          )}
        </div>
      )}

      {formModal && (
        <ShiftFormModal
          initial={formModal === "add" ? undefined : formModal}
          submitting={createShift.isPending || updateShift.isPending}
          error={formError}
          onClose={() => {
            setFormModal(null);
            setFormError(null);
          }}
          onSubmit={(values) => {
            if (formModal === "add") createShift.mutate(values);
            else updateShift.mutate({ id: formModal.id, values });
          }}
          onDelete={
            formModal !== "add"
              ? () => {
                  if (confirm(`Delete the ${formModal.name} shift? This also removes its pacing rules.`)) {
                    deleteShift.mutate(formModal.id);
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
