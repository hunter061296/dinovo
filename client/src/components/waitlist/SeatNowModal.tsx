import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { RestaurantTable } from "../../lib/tables";
import type { WaitlistEntry } from "../../lib/waitlist";

interface Props {
  entry: WaitlistEntry;
  onSeat: (tableId: string) => void;
  onClose: () => void;
  submitting?: boolean;
}

export function SeatNowModal({ entry, onSeat, onClose, submitting }: Props) {
  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const openTables = (tables ?? []).filter((t) => t.status === "OPEN" && t.capacity >= entry.partySize);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Seat {entry.guestName}</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Party of {entry.partySize} · choose an open table.</p>

        {openTables.length === 0 ? (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            No open tables large enough right now. Free one up on the Floor Plan first.
          </p>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {openTables.map((t) => (
              <button
                key={t.id}
                onClick={() => onSeat(t.id)}
                disabled={submitting}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-accent-50 hover:border-accent-300 disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-accent-900/30"
              >
                Table {t.number} <span className="text-gray-400 dark:text-gray-500">({t.capacity} seats)</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
