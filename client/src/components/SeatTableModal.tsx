import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { RestaurantTable } from "../lib/tables";

interface Props {
  title: string;
  subtitle: string;
  partySize: number;
  preferredTableId?: string | null;
  onSeat: (tableId: string) => void;
  onClose: () => void;
  submitting?: boolean;
}

export function SeatTableModal({ title, subtitle, partySize, preferredTableId, onSeat, onClose, submitting }: Props) {
  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const openTables = (tables ?? [])
    .filter((t) => t.status === "OPEN" && t.capacity >= partySize)
    // Surface the reservation's already-assigned table first, if it's free — that's almost
    // always the table a host wants to confirm.
    .sort((a, b) => (a.id === preferredTableId ? -1 : b.id === preferredTableId ? 1 : a.number - b.number));

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Seat {title}</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>

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
                className={`rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent-50 hover:border-accent-300 disabled:opacity-60 dark:hover:bg-accent-900/30 ${
                  t.id === preferredTableId
                    ? "border-accent-400 bg-accent-50 text-accent-700 dark:border-accent-600 dark:bg-accent-900/30 dark:text-accent-300"
                    : "border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300"
                }`}
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
