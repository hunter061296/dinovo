import { useState, type FormEvent } from "react";
import type { RestaurantTable, TableShape } from "../../lib/tables";

interface Props {
  initial?: RestaurantTable;
  onSubmit: (data: { number: number; capacity: number; shape: TableShape }) => void;
  onDelete?: () => void;
  onClose: () => void;
  submitting?: boolean;
  error?: string | null;
}

export function TableFormModal({ initial, onSubmit, onDelete, onClose, submitting, error }: Props) {
  const [number, setNumber] = useState(initial?.number?.toString() ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? "2");
  const [shape, setShape] = useState<TableShape>(initial?.shape ?? "SQUARE");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ number: Number(number), capacity: Number(capacity), shape });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{initial ? `Edit table ${initial.number}` : "Add table"}</h2>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Table number</span>
          <input
            type="number"
            required
            min={1}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Seat capacity</span>
          <input
            type="number"
            required
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="mb-5 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Shape</span>
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value as TableShape)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="ROUND">Round</option>
            <option value="SQUARE">Square</option>
            <option value="RECTANGLE">Rectangle</option>
          </select>
        </label>

        <div className="flex items-center justify-between gap-2">
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
