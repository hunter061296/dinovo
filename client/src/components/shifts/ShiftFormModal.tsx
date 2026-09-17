import { useState, type FormEvent } from "react";
import type { Shift } from "../../lib/reservations";
import { DAY_NAMES } from "../../lib/pacing";

export interface ShiftFormValues {
  name: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
}

interface Props {
  initial?: Shift;
  onSubmit: (values: ShiftFormValues) => void;
  onDelete?: () => void;
  onClose: () => void;
  submitting?: boolean;
  error?: string | null;
}

const toTime = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export function ShiftFormModal({ initial, onSubmit, onDelete, onClose, submitting, error }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(initial?.dayOfWeek ?? new Date().getDay());
  const [start, setStart] = useState(initial ? toTime(initial.startMinutes) : "11:00");
  const [end, setEnd] = useState(initial ? toTime(initial.endMinutes) : "15:00");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ name, dayOfWeek, startMinutes: toMinutes(start), endMinutes: toMinutes(end) });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{initial ? "Edit shift" : "Add shift"}</h2>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lunch, Dinner, Brunch..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Day of week</span>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {DAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="mb-5 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Start</span>
            <input
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">End</span>
            <input
              type="time"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>

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
