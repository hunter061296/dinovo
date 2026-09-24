import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { api } from "../../lib/api";
import { formatElapsed } from "../../lib/elapsed";
import type { SeatedSummaryEntry } from "../../lib/tables";
import type { Reservation } from "../../lib/reservations";
import { minutesToLabel } from "../../lib/reservations";
import { minutesSince, type WaitlistEntry } from "../../lib/waitlist";
import { SeatTableModal } from "../SeatTableModal";

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

type Tab = "upcoming" | "seated" | "waitlist";
type SortKey = "time" | "name" | "partySize" | "table" | "created";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "time", label: "Scheduled time" },
  { key: "name", label: "Name" },
  { key: "partySize", label: "Party size" },
  { key: "table", label: "Table" },
  { key: "created", label: "Created date" },
];

function sortReservations(list: Reservation[], sortBy: SortKey): Reservation[] {
  const sorted = [...list];
  switch (sortBy) {
    case "name":
      return sorted.sort((a, b) => `${a.guest.lastName} ${a.guest.firstName}`.localeCompare(`${b.guest.lastName} ${b.guest.firstName}`));
    case "partySize":
      return sorted.sort((a, b) => a.partySize - b.partySize);
    case "table":
      // Unassigned reservations sort after every assigned table, not before.
      return sorted.sort((a, b) => (a.table?.number ?? Infinity) - (b.table?.number ?? Infinity));
    case "created":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case "time":
    default:
      return sorted.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  }
}

interface Props {
  // The day being browsed on the Floor Plan (its date switcher) — the Upcoming list is scoped to
  // this date, but Seated/Waitlist stay live/"now" regardless, since floor and waitlist state has
  // no historical record to browse.
  date: string;
}

export function FloorPlanSidePanel({ date }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [sortBy, setSortBy] = useState<SortKey>("time");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [seatingReservation, setSeatingReservation] = useState<Reservation | null>(null);
  const [seatingWaitlistEntry, setSeatingWaitlistEntry] = useState<WaitlistEntry | null>(null);

  // Re-render every 30s so "waiting X min" / elapsed timers stay roughly live without polling.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const today = todayLocalISODate();
  const isToday = date === today;

  const { data: reservations } = useQuery<Reservation[]>({
    queryKey: ["reservations", date],
    queryFn: () => api.get("/reservations", { params: { date } }).then((res) => res.data),
  });
  // Seated/waitlist reflect the floor right now — always "today", independent of the date being
  // browsed above (there's no historical snapshot of live floor state to look back at).
  const { data: seatedSummary } = useQuery<SeatedSummaryEntry[]>({
    queryKey: ["tables", "seated-summary"],
    queryFn: () => api.get("/tables/seated-summary").then((res) => res.data),
    refetchInterval: 30_000,
  });
  const { data: waitlist } = useQuery<WaitlistEntry[]>({
    queryKey: ["waitlist"],
    queryFn: () => api.get("/waitlist").then((res) => res.data),
  });

  // Not-yet-seated reservations for the browsed date, regardless of whether their time has
  // already passed — a late arrival still needs seating, so it stays in this list rather than
  // dropping off.
  const upcoming = sortReservations(
    (reservations ?? []).filter((r) => r.status === "BOOKED"),
    sortBy
  );

  const invalidateAfterSeating = () => {
    queryClient.invalidateQueries({ queryKey: ["reservations", date] });
    queryClient.invalidateQueries({ queryKey: ["tables"] });
    queryClient.invalidateQueries({ queryKey: ["tables", "seated-summary"] });
    queryClient.invalidateQueries({ queryKey: ["waitlist"] });
  };

  const seatReservation = useMutation({
    mutationFn: ({ id, tableId }: { id: string; tableId: string }) =>
      api.patch(`/reservations/${id}`, { status: "SEATED", tableId }),
    onSuccess: () => {
      invalidateAfterSeating();
      setSeatingReservation(null);
    },
  });

  const seatWaitlistEntry = useMutation({
    mutationFn: ({ id, tableId }: { id: string; tableId: string }) => api.post(`/waitlist/${id}/seat`, { tableId }),
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

      {tab === "upcoming" && (
        <>
          <div ref={sortMenuRef} className="relative border-b border-gray-100 px-3 py-2 dark:border-gray-700">
            <button
              onClick={() => setSortMenuOpen((o) => !o)}
              className="flex w-full items-center justify-between text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span>
                Sort: <span className="font-medium text-gray-700 dark:text-gray-300">{SORT_OPTIONS.find((o) => o.key === sortBy)?.label}</span>
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {sortMenuOpen && (
              <div className="absolute left-3 right-3 top-full z-10 mt-1 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-700">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setSortBy(opt.key);
                      setSortMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    {opt.label}
                    {sortBy === opt.key && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-accent-600 dark:text-accent-400">
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {upcoming.length === 0 ? (
            <p className="p-3 text-xs text-gray-400 dark:text-gray-500">
              {isToday ? "Nothing else booked for today." : "Nothing booked for this date."}
            </p>
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
                    {/* Seating only makes sense for a party that could be here right now. */}
                    {isToday && (
                      <button
                        onClick={() => setSeatingReservation(r)}
                        className="shrink-0 rounded-md bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-700"
                      >
                        Seat
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

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
