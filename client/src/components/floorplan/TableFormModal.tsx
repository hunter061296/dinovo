import { useState, type FormEvent } from "react";
import type { RestaurantTable, Section, TableShape } from "../../lib/tables";
import { ModalBackdrop, ModalPanel } from "../Modal";
import { TableShapeIcon } from "./TableShapeIcon";

const SHAPES: { value: TableShape; label: string }[] = [
  { value: "ROUND", label: "Round" },
  { value: "SQUARE", label: "Square" },
  { value: "RECTANGLE", label: "Rectangle" },
];

interface Props {
  initial?: RestaurantTable;
  sections: Section[];
  onSubmit: (data: { number: number; capacity: number; shape: TableShape; sectionId: string | null }) => void;
  onDelete?: () => void;
  onClose: () => void;
  submitting?: boolean;
  error?: string | null;
}

export function TableFormModal({ initial, sections, onSubmit, onDelete, onClose, submitting, error }: Props) {
  const [number, setNumber] = useState(initial?.number?.toString() ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? "2");
  const [shape, setShape] = useState<TableShape>(initial?.shape ?? "SQUARE");
  const [sectionId, setSectionId] = useState(initial?.sectionId ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ number: Number(number), capacity: Number(capacity), shape, sectionId: sectionId || null });
  }

  return (
    <ModalBackdrop>
      <ModalPanel as="form" onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
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
        <div className="mb-3">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Shape</span>
          <div className="grid grid-cols-3 gap-2">
            {SHAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setShape(s.value)}
                aria-pressed={shape === s.value}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium ${
                  shape === s.value
                    ? "border-accent-400 bg-accent-50 text-accent-700 dark:border-accent-600 dark:bg-accent-900/30 dark:text-accent-300"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                <TableShapeIcon shape={s.value} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label className="mb-5 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Section</span>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">No section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
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
      </ModalPanel>
    </ModalBackdrop>
  );
}
