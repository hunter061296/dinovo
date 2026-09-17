import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Shift } from "../lib/reservations";
import { STATUS_LABELS, STATUS_STYLES, minutesToLabel } from "../lib/reservations";
import type { Reservation } from "../lib/reservations";
import { ReservationFormModal, type ReservationFormValues } from "../components/reservations/ReservationFormModal";

const SLOT_MINUTES = 30;

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

export function ReservationsPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayLocalISODate());
  const [modal, setModal] = useState<"add" | Reservation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: shifts } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: () => api.get("/shifts").then((res) => res.data),
  });

  const { data: reservations, isLoading, isError } = useQuery<Reservation[]>({
    queryKey: ["reservations", date],
    queryFn: () => api.get("/reservations", { params: { date } }).then((res) => res.data),
  });

  const slots = useMemo(() => {
    if (!shifts || shifts.length === 0) return [];
    const start = Math.min(...shifts.map((s) => s.startMinutes));
    const end = Math.max(...shifts.map((s) => s.endMinutes));
    const result: number[] = [];
    for (let m = start; m < end; m += SLOT_MINUTES) result.push(m);
    return result;
  }, [shifts]);

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
          <h1 className="text-xl font-semibold text-gray-900">Reservation Book</h1>
          <p className="text-sm text-gray-500">Day view across all shifts.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => setModal("add")}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New reservation
          </button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Loading reservations...</div>}
      {isError && <div className="text-sm text-red-600">Failed to load reservations.</div>}
      {shifts && shifts.length === 0 && (
        <div className="text-sm text-gray-500">No shifts are configured yet, so there's no timeline to show.</div>
      )}

      {slots.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {slots.map((slot) => {
            const items = reservationsBySlot.get(slot) ?? [];
            return (
              <div key={slot} className="flex border-t border-gray-100 first:border-t-0">
                <div className="w-24 shrink-0 border-r border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
                  {minutesToLabel(slot)}
                </div>
                <div className="flex flex-1 flex-wrap gap-2 p-2">
                  {items.length === 0 ? (
                    <span className="py-1.5 text-xs text-gray-300">—</span>
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
                          {r.table ? `Table ${r.table.number}` : "Unassigned"} · {STATUS_LABELS[r.status]}
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

      {modal && (
        <ReservationFormModal
          date={date}
          initial={modal === "add" ? undefined : modal}
          submitting={createReservation.isPending || updateReservation.isPending}
          error={formError}
          onClose={() => {
            setModal(null);
            setFormError(null);
          }}
          onSubmit={(values) => {
            if (modal === "add") {
              createReservation.mutate(values);
            } else {
              updateReservation.mutate({ id: modal.id, values });
            }
          }}
          onCancelReservation={
            modal !== "add"
              ? () => updateReservation.mutate({ id: modal.id, values: { status: "CANCELLED" } })
              : undefined
          }
        />
      )}
    </div>
  );
}
