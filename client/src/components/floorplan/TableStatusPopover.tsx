import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { RestaurantTable, TableStatus } from "../../lib/tables";
import { ModalBackdrop, ModalPanel } from "../Modal";
import { markTableSelfUpdated } from "../../lib/selfUpdatedTables";

const STATUS_OPTIONS: { value: TableStatus; label: string; className: string }[] = [
  {
    value: "OPEN",
    label: "Open",
    className: "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600",
  },
  {
    value: "SEATED",
    label: "Seated",
    className: "bg-blue-100 border-blue-400 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/60",
  },
  {
    value: "ORDERED",
    label: "Ordered",
    className: "bg-amber-100 border-amber-400 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/60",
  },
  {
    value: "NEEDS_CLEANING",
    label: "Needs Cleaning",
    className: "bg-red-100 border-red-400 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/60",
  },
];

interface Props {
  table: RestaurantTable;
  canEditLayout: boolean;
  onEditLayout: () => void;
  onClose: () => void;
}

export function TableStatusPopover({ table, canEditLayout, onEditLayout, onClose }: Props) {
  const queryClient = useQueryClient();
  const [notified, setNotified] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const setStatus = useMutation({
    mutationFn: (status: TableStatus) => {
      markTableSelfUpdated(table.id);
      return api.patch(`/tables/${table.id}/status`, { status });
    },
    onSuccess: (res) => {
      queryClient.setQueryData<RestaurantTable[]>(["tables"], (old) =>
        old?.map((t) => (t.id === table.id ? res.data : t))
      );
      onClose();
    },
  });

  async function handleNotify() {
    setNotifying(true);
    try {
      await api.post(`/tables/${table.id}/notify`);
      setNotified(true);
    } finally {
      setNotifying(false);
    }
  }

  return (
    <ModalBackdrop onClick={onClose}>
      <ModalPanel className="w-full max-w-xs rounded-lg bg-white p-4 shadow-lg dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Table {table.number}</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">{table.capacity} seats</span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatus.mutate(opt.value)}
              disabled={setStatus.isPending}
              className={`rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-60 ${opt.className} ${
                table.status === opt.value ? "ring-2 ring-offset-1 ring-accent-400" : ""
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mb-3">
          {notified ? (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
              ✓ Guest notified (stub — no real message was sent).
            </p>
          ) : (
            <button
              onClick={handleNotify}
              disabled={notifying}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {notifying ? "Notifying..." : "Notify guest table is ready"}
            </button>
          )}
        </div>

        <div className="flex justify-between gap-2">
          {canEditLayout ? (
            <button onClick={onEditLayout} className="text-sm font-medium text-accent-600 hover:underline">
              Edit table layout
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
