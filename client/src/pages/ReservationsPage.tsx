import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import type { Shift } from "../lib/reservations";
import { STATUS_LABELS, STATUS_STYLES, minutesToLabel, reservationTableLabel } from "../lib/reservations";
import type { Reservation } from "../lib/reservations";
import { coversInSlot, dayOfWeekFor, findPacingRule } from "../lib/pacing";
import { ReservationFormModal, type ReservationFormValues } from "../components/reservations/ReservationFormModal";
import { ReservationWizardModal } from "../components/reservations/ReservationWizardModal";
import { DateSwitcher, todayLocalISODate } from "../components/DateSwitcher";
import { ReservationGrid } from "../components/reservations/ReservationGrid";

const SLOT_MINUTES = 30;

export function ReservationsPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayLocalISODate());
  // In the URL so a host can bookmark/refresh straight into the grid.
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "grid" ? "grid" : "list";
  const [modal, setModal] = useState<"add" | Reservation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    data: shifts,
    isLoading: shiftsLoading,
    isError: shiftsError,
  } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: () => api.get("/shifts").then((res) => res.data),
  });

  const {
    data: reservations,
    isLoading: reservationsLoading,
    isError: reservationsError,
  } = useQuery<Reservation[]>({
    queryKey: ["reservations", date],
    queryFn: () => api.get("/reservations", { params: { date } }).then((res) => res.data),
  });

  // Both queries feed the same timeline — show one combined loading/error state rather than
  // flashing "no reservations" while shifts (which the slots themselves depend on) is still in flight.
  const isLoading = shiftsLoading || reservationsLoading;
  const isError = shiftsError || reservationsError;

  const dayOfWeek = dayOfWeekFor(date);
  // Only this weekday's shifts frame the day — another day's later dinner shouldn't stretch it.
  const shiftsThatDay = useMemo(() => (shifts ?? []).filter((s) => s.dayOfWeek === dayOfWeek), [shifts, dayOfWeek]);

  const slots = useMemo(() => {
    if (shiftsThatDay.length === 0) return [];
    let start = Math.min(...shiftsThatDay.map((s) => s.startMinutes));
    let end = Math.max(...shiftsThatDay.map((s) => s.endMinutes));
    // Widen to any reservation booked outside shift hours (a late seating, an early private
    // party) — otherwise it would have no slot and silently vanish from the book.
    for (const r of reservations ?? []) {
      const d = new Date(r.dateTime);
      const minutes = d.getHours() * 60 + d.getMinutes();
      start = Math.min(start, minutes - (minutes % SLOT_MINUTES));
      end = Math.max(end, minutes - (minutes % SLOT_MINUTES) + SLOT_MINUTES);
    }
    const result: number[] = [];
    for (let m = start; m < end; m += SLOT_MINUTES) result.push(m);
    return result;
  }, [shiftsThatDay, reservations]);

  const reservationsBySlot = useMemo(() => {
    const map = new Map<number, Reservation[]>();
    for (const r of reservations ?? []) {
      const d = new Date(r.dateTime);
      const minutes = d.getHours() * 60 + d.getMinutes();
      const slot = minutes - (minutes % SLOT_MINUTES);
      if (!map.has(slot)) map.set(slot, []);
      map.get(slot)!.push(r);
    }
    return map;
  }, [reservations]);

  const createReservation = useMutation({
    mutationFn: (values: ReservationFormValues) => api.post("/reservations", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations", date] });
      setModal(null);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to create reservation"),
  });

  const updateReservation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<ReservationFormValues> }) =>
      api.patch(`/reservations/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations", date] });
      setModal(null);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to update reservation"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Reservation Book</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {view === "grid" ? "Every table across the day — drag to move parties." : "Day view across all shifts."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="View" className="flex overflow-hidden rounded-md border border-gray-300 text-sm dark:border-gray-600">
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => setSearchParams(v === "grid" ? { view: "grid" } : {}, { replace: true })}
                className={`px-3 py-1.5 font-medium ${
                  view === v
                    ? "bg-accent-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {v === "list" ? "List" : "Grid"}
              </button>
            ))}
          </div>
          <DateSwitcher date={date} onChange={setDate} />
          <Link
            to={`/reservations/print?date=${date}`}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Print / Export
          </Link>
          <button
            onClick={() => setModal("add")}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
          >
            New reservation
          </button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading reservations...</div>}
      {isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load reservations.</div>}
      {!isLoading && !isError && view === "grid" && (
        <ReservationGrid date={date} reservations={reservations ?? []} shifts={shifts ?? []} onOpenReservation={setModal} />
      )}

      {!isLoading && !isError && view === "list" && shifts && shiftsThatDay.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          No shifts are configured for this day, so there's no timeline to show — try the Grid view, or add a shift under Shifts &amp; Pacing.
        </div>
      )}

      {!isLoading && !isError && view === "list" && slots.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {slots.map((slot) => {
            const items = reservationsBySlot.get(slot) ?? [];
            const rule = shifts ? findPacingRule(shifts, slot, dayOfWeek) : undefined;
            const covers = reservations ? coversInSlot(reservations, slot) : 0;
            const overCap = rule && covers > rule.maxCovers;
            return (
              <div
                key={slot}
                className={`flex border-t border-gray-100 dark:border-gray-700 first:border-t-0 ${overCap ? "bg-amber-50 dark:bg-amber-900/20" : ""}`}
              >
                <div className="w-24 shrink-0 border-r border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                  {minutesToLabel(slot)}
                  {rule && (
                    <div className={overCap ? "font-semibold text-amber-700 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"}>
                      {covers}/{rule.maxCovers} covers{overCap ? " ⚠" : ""}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-wrap gap-2 p-2">
                  {items.length === 0 ? (
                    <span className="py-1.5 text-xs text-gray-300 dark:text-gray-600">—</span>
                  ) : (
                    items.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setModal(r)}
                        className={`rounded-md border px-3 py-1.5 text-left text-xs shadow-sm hover:shadow ${STATUS_STYLES[r.status]}`}
                      >
                        <div className="font-semibold">
                          {r.guest.firstName} {r.guest.lastName} · {r.partySize}
                        </div>
                        <div className="opacity-75">
                          {reservationTableLabel(r)} · {STATUS_LABELS[r.status]}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {modal === "add" && (
          <ReservationWizardModal
            key="wizard"
            initialDate={date}
            submitting={createReservation.isPending}
            error={formError}
            onClose={() => {
              setModal(null);
              setFormError(null);
            }}
            onSubmit={(values) => createReservation.mutate(values)}
          />
        )}

        {modal && modal !== "add" && (
          <ReservationFormModal
            key="edit-form"
            date={date}
            shifts={shifts ?? []}
            reservationsThatDay={reservations ?? []}
            initial={modal}
            submitting={updateReservation.isPending}
            error={formError}
            onClose={() => {
              setModal(null);
              setFormError(null);
            }}
            onSubmit={(values) => updateReservation.mutate({ id: modal.id, values })}
            onCancelReservation={() => updateReservation.mutate({ id: modal.id, values: { status: "CANCELLED" } })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
