import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { api } from "../../lib/api";
import { formatElapsed } from "../../lib/elapsed";
import type { SeatedSummaryEntry } from "../../lib/tables";
import type { Reservation } from "../../lib/reservations";
import { minutesToLabel } from "../../lib/reservations";
import { minutesSince, type WaitlistEntry } from "../../lib/waitlist";
import { SeatTableModal } from "../SeatTableModal";
import { markTableSelfUpdated } from "../../lib/selfUpdatedTables";
import { markWaitlistEntrySelfUpdated } from "../../lib/selfInitiated";

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

type Tab = "upcoming" | "seated" | "waitlist";

export function FloorPlanSidePanel() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [seatingReservation, setSeatingReservation] = useState<Reservation | null>(null);
  const [seatingWaitlistEntry, setSeatingWaitlistEntry] = useState<WaitlistEntry | null>(null);

  // Re-render every 30s so "waiting X min" / elapsed timers stay roughly live without polling.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const today = todayLocalISODate();
  const { data: reservations } = useQuery<Reservation[]>({
    queryKey: ["reservations", today],
    queryFn: () => api.get("/reservations", { params: { date: today } }).then((res) => res.data),
  });
  const { data: seatedSummary } = useQuery<SeatedSummaryEntry[]>({
    queryKey: ["tables", "seated-summary"],
    queryFn: () => api.get("/tables/seated-summary").then((res) => res.data),
    refetchInterval: 30_000,
  });
  const { data: waitlist } = useQuery<WaitlistEntry[]>({
    queryKey: ["waitlist"],
    queryFn: () => api.get("/waitlist").then((res) => res.data),
  });

  // Not-yet-seated reservations for today, regardless of whether their time has already
  // passed — a late arrival still needs seating, so it stays in this list rather than dropping off.
  const upcoming = (reservations ?? [])
    .filter((r) => r.status === "BOOKED")
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  const invalidateAfterSeating = () => {
    queryClient.invalidateQueries({ queryKey: ["reservations", today] });
    queryClient.invalidateQueries({ queryKey: ["tables"] });
    queryClient.invalidateQueries({ queryKey: ["tables", "seated-summary"] });
    queryClient.invalidateQueries({ queryKey: ["waitlist"] });
  };

  const seatReservation = useMutation({
    mutationFn: ({ id, tableId }: { id: string; tableId: string }) => {
      markTableSelfUpdated(tableId);
      return api.patch(`/reservations/${id}`, { status: "SEATED", tableId });
    },
    onSuccess: () => {
      invalidateAfterSeating();
      setSeatingReservation(null);
    },
  });

  const seatWaitlistEntry = useMutation({
    mutationFn: ({ id, tableId }: { id: string; tableId: string }) => {
      markWaitlistEntrySelfUpdated(id);
      markTableSelfUpdated(tableId);
      return api.post(`/waitlist/${id}/seat`, { tableId });
    },
    onSuccess: () => {
      invalidateAfterSeating();
      setSeatingWaitlistEntry(null);
    },
  });

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
    { key: "seated", label: "Seated", count: seatedSummary?.length ?? 0 },
    { key: "waitlist", label: "Waitlist", count: waitlist?.length ?? 0 },
  ];

  return (
    <div className="w-full shrink-0 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 sm:w-72">
      <div className="flex border-b border-gray-100 dark:border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 border-b-2 px-2 py-2.5 text-xs font-semibold ${
              tab === t.key
                ? "border-accent-600 text-accent-700 dark:text-accent-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {t.label} {t.count > 0 && <span className="text-gray-400 dark:text-gray-500">({t.count})</span>}
          </button>
        ))}
      </div>

      {tab === "upcoming" &&
        (upcoming.length === 0 ? (
          <p className="p-3 text-xs text-gray-400 dark:text-gray-500">Nothing else booked for today.</p>
        ) : (
          <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
            {upcoming.map((r) => (
              <li key={r.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                      {r.guest.firstName} {r.guest.lastName} · {r.partySize}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {minutesToLabel(new Date(r.dateTime).getHours() * 60 + new Date(r.dateTime).getMinutes())} ·{" "}
                      {r.table ? `Table ${r.table.number}` : "Unassigned"}
                    </div>
                  </div>
                  <button
                    onClick={() => setSeatingReservation(r)}
                    className="shrink-0 rounded-md bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-700"
                  >
                    Seat
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === "seated" &&
        (!seatedSummary || seatedSummary.length === 0 ? (
          <p className="p-3 text-xs text-gray-400 dark:text-gray-500">No tables seated right now.</p>
        ) : (
          <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
            {seatedSummary.map((e) => (
              <li key={e.tableId} className="flex items-center justify-between px-3 py-2.5 text-sm">
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
        ))}

      {tab === "waitlist" &&
        (!waitlist || waitlist.length === 0 ? (
          <p className="p-3 text-xs text-gray-400 dark:text-gray-500">No one is waiting right now.</p>
        ) : (
          <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
            {waitlist.map((entry) => (
              <li key={entry.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                      {entry.guestName} · {entry.partySize}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Waiting {minutesSince(entry.addedAt)} min</div>
                  </div>
                  <button
                    onClick={() => setSeatingWaitlistEntry(entry)}
                    className="shrink-0 rounded-md bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-700"
                  >
                    Seat
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      <AnimatePresence>
        {seatingReservation && (
          <SeatTableModal
            key="seat-reservation"
            title={`${seatingReservation.guest.firstName} ${seatingReservation.guest.lastName}`}
            subtitle={`Party of ${seatingReservation.partySize} · choose an open table.`}
            partySize={seatingReservation.partySize}
            preferredTableId={seatingReservation.tableId}
            submitting={seatReservation.isPending}
            onClose={() => setSeatingReservation(null)}
            onSeat={(tableId) => seatReservation.mutate({ id: seatingReservation.id, tableId })}
          />
        )}

        {seatingWaitlistEntry && (
          <SeatTableModal
            key="seat-waitlist"
            title={seatingWaitlistEntry.guestName}
            subtitle={`Party of ${seatingWaitlistEntry.partySize} · choose an open table.`}
            partySize={seatingWaitlistEntry.partySize}
            submitting={seatWaitlistEntry.isPending}
            onClose={() => setSeatingWaitlistEntry(null)}
            onSeat={(tableId) => seatWaitlistEntry.mutate({ id: seatingWaitlistEntry.id, tableId })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
