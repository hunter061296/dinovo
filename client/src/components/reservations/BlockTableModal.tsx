import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../../lib/api";
import type { RestaurantTable, TableBlock } from "../../lib/tables";
import { isoAtMinutes, minutesFromDayStart } from "../../lib/grid";
import { ModalBackdrop, ModalCloseButton, ModalPanel } from "../Modal";

const toTimeInput = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
};
const fromTimeInput = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

interface Props {
  date: string; // YYYY-MM-DD the block's times are on
  // Editing an existing block, or prefilled values for a new one.
  block?: TableBlock;
  initialTableId?: string;
  initialStartMinutes?: number;
  onClose: () => void;
}

// Hold a table out of service for a time range — a VIP hold, a broken chair, a private event.
// The server rejects a block that would overlap a party already booked there.
export function BlockTableModal({ date, block, initialTableId, initialStartMinutes, onClose }: Props) {
  const queryClient = useQueryClient();
  const startDefault = block ? minutesFromDayStart(block.startsAt, date) : (initialStartMinutes ?? 17 * 60);
  const endDefault = block ? minutesFromDayStart(block.endsAt, date) : startDefault + 120;

  const [tableId, setTableId] = useState(block?.tableId ?? initialTableId ?? "");
  const [start, setStart] = useState(toTimeInput(startDefault));
  const [end, setEnd] = useState(toTimeInput(endDefault));
  const [reason, setReason] = useState(block?.reason ?? "");

  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["table-blocks", date] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const startMinutes = fromTimeInput(start);
      let endMinutes = fromTimeInput(end);
      // An end time "before" the start means the block runs past midnight.
      if (endMinutes <= startMinutes) endMinutes += 1440;
      const body = {
        tableId,
        startsAt: isoAtMinutes(date, startMinutes),
        endsAt: isoAtMinutes(date, endMinutes),
        reason: reason.trim() || null,
      };
      return block ? api.patch(`/table-blocks/${block.id}`, body) : api.post("/table-blocks", body);
    },
    onSuccess: done,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/table-blocks/${block!.id}`),
    onSuccess: done,
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const error = apiErrorMessage(save.error ?? remove.error, "Failed to save block");

  return (
    <ModalBackdrop>
      <ModalPanel as="form" onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{block ? "Table block" : "Block a table"}</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Table</span>
          <select
            required
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="" disabled>
              Choose a table
            </option>
            {tables?.map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.number} ({t.capacity} seats)
              </option>
            ))}
          </select>
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">From</span>
            <input
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Until</span>
            <input
              type="time"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>

        <label className="mb-5 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Reason (optional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VIP hold, maintenance, private event..."
            maxLength={200}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        {block?.createdBy && (
          <p className="-mt-3 mb-4 text-xs text-gray-500 dark:text-gray-400">Blocked by {block.createdBy.name}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div>
            {block && (
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                Remove block
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
              disabled={save.isPending || !tableId}
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {save.isPending ? "Saving..." : block ? "Save" : "Block table"}
            </button>
          </div>
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
