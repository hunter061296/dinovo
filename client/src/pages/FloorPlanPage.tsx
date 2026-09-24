import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { getSocket } from "../lib/socket";
import type { RestaurantTable, Section, SeatedSummaryEntry } from "../lib/tables";
import type { Reservation } from "../lib/reservations";
import { minutesToLabel } from "../lib/reservations";
import { TableStatusPopover } from "../components/floorplan/TableStatusPopover";
import { FloorPlanSidePanel } from "../components/floorplan/FloorPlanSidePanel";
import { FloorPlanCanvas } from "../components/floorplan/FloorPlanCanvas";
import { MiniCalendar } from "../components/reservations/MiniCalendar";

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function formatDateHeading(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function FloorPlanPage() {
  const { user } = useAuth();
  const canEditLayout = user?.role === "ADMIN" || user?.role === "MANAGER";
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // The date being browsed — the Upcoming list and per-table "who's next" badges are scoped to
  // this, but live floor/waitlist state (table status, Seated, Waitlist) always reflects right
  // now regardless, since Dinovo has no historical snapshot of that to browse (see
  // FloorPlanSidePanel).
  const [date, setDate] = useState(todayLocalISODate());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setDatePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const { data: tables, isLoading, isError } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["sections"],
    queryFn: () => api.get("/sections").then((res) => res.data),
  });

  // Feeds the guest-name/upcoming-reservation badges drawn directly on each TableCard — shares a
  // cache key with FloorPlanSidePanel's own queries, so this doesn't add an extra network round trip.
  const { data: dateReservations } = useQuery<Reservation[]>({
    queryKey: ["reservations", date],
    queryFn: () => api.get("/reservations", { params: { date } }).then((res) => res.data),
  });
  const { data: seatedSummary } = useQuery<SeatedSummaryEntry[]>({
    queryKey: ["tables", "seated-summary"],
    queryFn: () => api.get("/tables/seated-summary").then((res) => res.data),
    refetchInterval: 30_000,
  });

  const [statusTable, setStatusTable] = useState<RestaurantTable | null>(null);

  const seatedGuestByTable = new Map(
    (seatedSummary ?? []).map((e) => [e.tableId, e.guestName ?? "Walk-in"] as const)
  );

  // Soonest not-yet-seated reservation per table on the browsed date, so an OPEN table can show
  // "who's coming next".
  const upcomingByTable = new Map<string, { time: string; guestName: string; at: number }>();
  for (const r of dateReservations ?? []) {
    if (r.status !== "BOOKED" || !r.tableId) continue;
    const at = new Date(r.dateTime).getTime();
    const existing = upcomingByTable.get(r.tableId);
    if (existing && existing.at <= at) continue;
    const dt = new Date(r.dateTime);
    upcomingByTable.set(r.tableId, {
      at,
      time: minutesToLabel(dt.getHours() * 60 + dt.getMinutes()),
      guestName: `${r.guest.firstName} ${r.guest.lastName}`,
    });
  }

  // Keeps every open host-stand screen in sync — a status change made on one iPad shows up
  // on all the others without anyone refreshing.
  useEffect(() => {
    const socket = getSocket();
    const upsert = (table: RestaurantTable) => {
      queryClient.setQueryData<RestaurantTable[]>(["tables"], (old) => {
        if (!old) return old;
        const exists = old.some((t) => t.id === table.id);
        return exists ? old.map((t) => (t.id === table.id ? table : t)) : [...old, table].sort((a, b) => a.number - b.number);
      });
      queryClient.invalidateQueries({ queryKey: ["tables", "seated-summary"] });
    };
    const remove = ({ id }: { id: string }) => {
      queryClient.setQueryData<RestaurantTable[]>(["tables"], (old) => old?.filter((t) => t.id !== id));
    };
    socket.on("table:created", upsert);
    socket.on("table:updated", upsert);
    socket.on("table:deleted", remove);
    return () => {
      socket.off("table:created", upsert);
      socket.off("table:updated", upsert);
      socket.off("table:deleted", remove);
    };
  }, [queryClient]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Floor Plan</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Click a table to change its status.</p>
        </div>

        {/* Date switcher — browses the Upcoming list/table badges; live floor status stays "now". */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            aria-label="Previous day"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 010 1.06L8.06 11l4.73 4.71a.75.75 0 11-1.06 1.06l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" clipRule="evenodd" />
            </svg>
          </button>

          <div ref={datePickerRef} className="relative">
            <button
              onClick={() => setDatePickerOpen((o) => !o)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {date === todayLocalISODate() ? "Today" : formatDateHeading(date)}
            </button>
            {datePickerOpen && (
              <div className="absolute left-1/2 top-full z-10 mt-1 w-64 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-700">
                <MiniCalendar
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setDatePickerOpen(false);
                  }}
                />
              </div>
            )}
          </div>

          <button
            onClick={() => setDate((d) => shiftDate(d, 1))}
            aria-label="Next day"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 010-1.06L11.94 9 7.21 4.29a.75.75 0 111.06-1.06l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {canEditLayout && (
          <Link
            to="/floor-plan/settings"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Edit layout
          </Link>
        )}
      </div>

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading floor plan...</div>}
      {isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load the floor plan.</div>}

      {tables && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <FloorPlanSidePanel date={date} />

          <FloorPlanCanvas
            tables={tables}
            sections={sections}
            draggable={false}
            showManageSections={false}
            onTableClick={setStatusTable}
            seatedGuestByTable={seatedGuestByTable}
            upcomingByTable={upcomingByTable}
            emptyMessageNoTables={
              canEditLayout ? 'No tables yet. Use "Edit layout" to build your floor plan.' : "No tables yet."
            }
          />
        </div>
      )}

      <AnimatePresence>
        {statusTable && (
          <TableStatusPopover
            key="status-popover"
            table={tables?.find((t) => t.id === statusTable.id) ?? statusTable}
            canEditLayout={canEditLayout}
            onEditLayout={() => {
              setStatusTable(null);
              navigate(`/floor-plan/settings?table=${statusTable.id}`);
            }}
            onClose={() => setStatusTable(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
