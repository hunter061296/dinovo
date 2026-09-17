import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatElapsed } from "../../lib/elapsed";
import type { SeatedSummaryEntry } from "../../lib/tables";

interface Props {
  fullWidth?: boolean;
}

export function CurrentlySeatedPanel({ fullWidth }: Props = {}) {
  // Re-render every 30s so the elapsed timers stay roughly live without polling the server.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: entries } = useQuery<SeatedSummaryEntry[]>({
    queryKey: ["tables", "seated-summary"],
    queryFn: () => api.get("/tables/seated-summary").then((res) => res.data),
    refetchInterval: 30_000,
  });

  return (
    <div className={`w-full shrink-0 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 ${fullWidth ? "" : "sm:w-56"}`}>
      <h2 className="border-b border-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300">
        Currently Seated {entries && entries.length > 0 && <span className="text-gray-400 dark:text-gray-500">({entries.length})</span>}
      </h2>
      {!entries || entries.length === 0 ? (
        <p className="p-3 text-xs text-gray-400 dark:text-gray-500">No tables seated right now.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {entries.map((e) => (
            <li key={e.tableId} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {e.guestName ?? "Walk-in"} {e.partySize ? `· ${e.partySize}` : ""}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Table {e.tableNumber}</div>
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                {formatElapsed(e.statusUpdatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
