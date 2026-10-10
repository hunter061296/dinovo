import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { RestaurantTable, TableCombination } from "../../lib/tables";
import { combinationLabel } from "../../lib/tables";
import { ModalBackdrop, ModalCloseButton, ModalPanel } from "../Modal";

interface Props {
  tables: RestaurantTable[];
  onClose: () => void;
}

// Predefined pushed-together table sets (e.g. 4 + 5 seat 8) that hosts can book a large party on.
export function CombinationManagerModal({ tables, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: combinations } = useQuery<TableCombination[]>({
    queryKey: ["table-combinations"],
    queryFn: () => api.get("/table-combinations").then((res) => res.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["table-combinations"] });
  const onError = (fallback: string) => (err: any) => setError(err.response?.data?.error || fallback);

  const create = useMutation({
    mutationFn: () => api.post("/table-combinations", { tableIds: selected, capacity: capacity ? Number(capacity) : undefined }),
    onSuccess: () => {
      invalidate();
      setSelected([]);
      setCapacity("");
      setError(null);
    },
    onError: onError("Failed to create combination"),
  });

  const updateCapacity = useMutation({
    mutationFn: ({ id, capacity }: { id: string; capacity: number }) => api.patch(`/table-combinations/${id}`, { capacity }),
    onSuccess: () => {
      invalidate();
      setError(null);
    },
    onError: onError("Failed to update combination"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/table-combinations/${id}`),
    onSuccess: invalidate,
    onError: onError("Failed to delete combination"),
  });

  const combinedSeats = tables.filter((t) => selected.includes(t.id)).reduce((sum, t) => sum + t.capacity, 0);
  const sortedTables = [...tables].sort((a, b) => a.number - b.number);

  return (
    <ModalBackdrop>
      <ModalPanel className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Combined tables</h2>
          <ModalCloseButton onClick={onClose} />
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Tables that get pushed together for big parties. A party booked on a combination holds every table in it.
        </p>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

        <ul className="mb-5 divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {(combinations ?? []).length === 0 && (
            <li className="px-3 py-3 text-center text-sm text-gray-400 dark:text-gray-500">No combinations yet.</li>
          )}
          {combinations?.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100">Tables {combinationLabel(c)}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  Seats
                  <input
                    type="number"
                    min={1}
                    defaultValue={c.capacity}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (next > 0 && next !== c.capacity) updateCapacity.mutate({ id: c.id, capacity: next });
                    }}
                    className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                <button
                  onClick={() => {
                    if (confirm(`Delete combination ${combinationLabel(c)}? Parties booked on it keep their first table.`)) remove.mutate(c.id);
                  }}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">New combination</h3>
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {sortedTables.map((t) => (
            <label
              key={t.id}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
                selected.includes(t.id)
                  ? "border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-800/30 dark:text-accent-200"
                  : "border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)))}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              T{t.number} ({t.capacity})
            </label>
          ))}
        </div>
        <div className="flex items-end justify-between gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Seats</span>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={combinedSeats ? String(combinedSeats) : "—"}
              className="w-24 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <button
            onClick={() => create.mutate()}
            disabled={selected.length < 2 || create.isPending}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {create.isPending ? "Adding..." : "Add combination"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Pick two or more tables. Seats defaults to their combined total.</p>
      </ModalPanel>
    </ModalBackdrop>
  );
}
