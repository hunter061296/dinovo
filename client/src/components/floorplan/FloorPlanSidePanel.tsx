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

function matchesSearch(query: string, ...fields: (string | null | undefined)[]) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

// Small tablet/floor-plan glyph for the row-level "assign a table" action, distinct from tapping
// the guest's name (which opens their reservation detail instead).
function AssignTableIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 1.5h12a.5.5 0 01.5.5v8a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V6a.5.5 0 01.5-.5zM6 8a1 1 0 000 2h8a1 1 0 100-2H6zm0 3a1 1 0 100 2h4a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  );
}

interface Props {
  // The day being browsed on the Floor Plan (its date switcher) — the Upcoming list is scoped to
  // this date, but Seated/Waitlist stay live/"now" regardless, since floor and waitlist state has
  // no historical record to browse.
  date: string;
  // Opens the full reservation detail panel (tags, notes, guest stats, etc.) — clicking a guest's
  // name is a separate action from the row's "assign a table" icon.
  onOpenReservation: (r: Reservation) => void;
}

export function FloorPlanSidePanel({ date, onOpenReservation }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [search, setSearch] = useState("");
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
    (reservations ?? []).filter(
      (r) =>
        r.status === "BOOKED" &&
        matchesSearch(search, r.guest.firstName, r.guest.lastName, `${r.guest.firstName} ${r.guest.lastName}`, r.guest.phone)
    ),
    sortBy
  );
  const filteredSeated = (seatedSummary ?? []).filter((e) => matchesSearch(search, e.guestName));
  const filteredWaitlist = (waitlist ?? []).filter((e) => matchesSearch(search, e.guestName, e.phone));

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

  // Assigns a table ahead of time without seating — the reservation stays BOOKED. The server's
  // own conflict check still blocks assigning a table that's genuinely double-booked.
  const preAssignReservation = useMutation({
    mutationFn: ({ id, tableId }: { id: string; tableId: string }) => api.patch(`/reservations/${id}`, { tableId }),
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
    { key: "seated", label: "Seated", count: filteredSeated.length },
    { key: "waitlist", label: "Waitlist", count: filteredWaitlist.length },
  ];

  return (
    <div className="flex h-full w-full shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 sm:w-72">
      <div className="shrink-0 border-b border-gray-100 p-2 dark:border-gray-700">
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      <div className="flex shrink-0 border-b border-gray-100 dark:border-gray-700">
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={sortMenuRef} className="relative shrink-0 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
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
            <p className="flex-1 overflow-y-auto p-3 text-xs text-gray-400 dark:text-gray-500">
              {search ? "No matching reservations." : isToday ? "Nothing else booked for today." : "Nothing booked for this date."}
            </p>
          ) : (
            <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
              {upcoming.map((r) => (
                <li key={r.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    {/* Opens the full reservation detail panel. */}
                    <button onClick={() => onOpenReservation(r)} className="min-w-0 flex-1 text-left hover:underline">
                      <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                        {r.guest.firstName} {r.guest.lastName} · {r.partySize}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {minutesToLabel(new Date(r.dateTime).getHours() * 60 + new Date(r.dateTime).getMinutes())} ·{" "}
                        {r.table ? `Table ${r.table.number}` : "Unassigned"}
                      </div>
                    </button>
                    {/* Assign/seat a table — a separate action from opening the reservation above. */}
                    {isToday && (
                      <button
                        onClick={() => setSeatingReservation(r)}
                        aria-label={`Assign a table for ${r.guest.firstName} ${r.guest.lastName}`}
                        title="Assign a table"
                        className="shrink-0 rounded-md bg-accent-600 p-1.5 text-white hover:bg-accent-700"
                      >
                        <AssignTableIcon />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "seated" &&
        (filteredSeated.length === 0 ? (
          <p className="flex-1 overflow-y-auto p-3 text-xs text-gray-400 dark:text-gray-500">
            {search ? "No matching tables." : "No tables seated right now."}
          </p>
        ) : (
          <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
            {filteredSeated.map((e) => (
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
        (filteredWaitlist.length === 0 ? (
          <p className="flex-1 overflow-y-auto p-3 text-xs text-gray-400 dark:text-gray-500">
            {search ? "No matching parties." : "No one is waiting right now."}
          </p>
        ) : (
          <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
            {filteredWaitlist.map((entry) => (
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
            subtitle={`${minutesToLabel(
              new Date(seatingReservation.dateTime).getHours() * 60 + new Date(seatingReservation.dateTime).getMinutes()
            )}, party of ${seatingReservation.partySize}`}
            partySize={seatingReservation.partySize}
            preferredTableId={seatingReservation.tableId}
            submitting={seatReservation.isPending || preAssignReservation.isPending}
            onClose={() => setSeatingReservation(null)}
            onSeat={(tableId) => seatReservation.mutate({ id: seatingReservation.id, tableId })}
            onPreAssign={(tableId) => preAssignReservation.mutate({ id: seatingReservation.id, tableId })}
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
