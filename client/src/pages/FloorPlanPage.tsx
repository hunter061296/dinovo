import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { getSocket } from "../lib/socket";
import type { RestaurantTable, Section, SeatedSummaryEntry } from "../lib/tables";
import type { Reservation, ReservationFormValues, Shift } from "../lib/reservations";
import { minutesToLabel } from "../lib/reservations";
import { TableStatusPopover } from "../components/floorplan/TableStatusPopover";
import { FloorPlanSidePanel } from "../components/floorplan/FloorPlanSidePanel";
import { FloorPlanCanvas } from "../components/floorplan/FloorPlanCanvas";
import { FloorPlanReservationPanel } from "../components/floorplan/FloorPlanReservationPanel";
import { DateSwitcher, todayLocalISODate } from "../components/DateSwitcher";

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
  // For the reservation detail panel's pacing-warning calc (ReservationFormModal).
  const { data: shifts } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: () => api.get("/shifts").then((res) => res.data),
  });

  const [statusTable, setStatusTable] = useState<RestaurantTable | null>(null);
  const [openReservation, setOpenReservation] = useState<Reservation | null>(null);
  const [reservationError, setReservationError] = useState<string | null>(null);

  const updateReservation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<ReservationFormValues> }) =>
      api.patch(`/reservations/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations", date] });
      setOpenReservation(null);
      setReservationError(null);
    },
    onError: (err: any) => setReservationError(err.response?.data?.error || "Failed to update reservation"),
  });

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
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Floor Plan</h1>

        {/* Date switcher — browses the Upcoming list/table badges; live floor status stays "now". */}
        <DateSwitcher date={date} onChange={setDate} />

        {canEditLayout && (
          <Link
            to="/floor-plan/settings"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Edit layout
          </Link>
        )}
      </div>

      {isLoading && <div className="shrink-0 text-sm text-gray-500 dark:text-gray-400">Loading floor plan...</div>}
      {isError && <div className="shrink-0 text-sm text-red-600 dark:text-red-400">Failed to load the floor plan.</div>}

      {tables && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row">
          <FloorPlanSidePanel date={date} onOpenReservation={setOpenReservation} />

          {/* The reservation detail panel loads in place of the canvas — OpenTable-style — rather
              than as a floating dialog over it. */}
          {openReservation ? (
            <FloorPlanReservationPanel
              date={date}
              shifts={shifts ?? []}
              reservationsThatDay={dateReservations ?? []}
              initial={openReservation}
              submitting={updateReservation.isPending}
              error={reservationError}
              onBack={() => {
                setOpenReservation(null);
                setReservationError(null);
              }}
              onSubmit={(values) => updateReservation.mutate({ id: openReservation.id, values })}
              onCancelReservation={() => updateReservation.mutate({ id: openReservation.id, values: { status: "CANCELLED" } })}
            />
          ) : (
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
          )}
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
