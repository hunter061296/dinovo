import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { RestaurantTable } from "../../lib/tables";
import type { Reservation, ReservationStatus } from "../../lib/reservations";
import { STATUS_LABELS } from "../../lib/reservations";
import { GuestPicker, type NewGuestInput } from "./GuestPicker";

export interface ReservationFormValues {
  guestId?: string;
  newGuest?: NewGuestInput;
  partySize: number;
  dateTime: string; // ISO
  tableId: string | null;
  notes: string;
  status?: ReservationStatus;
}

interface Props {
  date: string; // YYYY-MM-DD, used to default the time field
  initial?: Reservation;
  onSubmit: (values: ReservationFormValues) => void;
  onCancelReservation?: () => void;
  onClose: () => void;
  submitting?: boolean;
  error?: string | null;
}

function toTimeInputValue(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function ReservationFormModal({ date, initial, onSubmit, onCancelReservation, onClose, submitting, error }: Props) {
  const [guest, setGuest] = useState(initial?.guest ?? null);
  const [newGuest, setNewGuest] = useState<NewGuestInput | null>(null);
  const [partySize, setPartySize] = useState(initial?.partySize?.toString() ?? "2");
  const [time, setTime] = useState(initial ? toTimeInputValue(initial.dateTime) : "18:00");
  const [tableId, setTableId] = useState<string>(initial?.tableId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<ReservationStatus>(initial?.status ?? "BOOKED");

  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const [hours, minutes] = time.split(":").map(Number);
    const dateTime = new Date(`${date}T00:00:00`);
    dateTime.setHours(hours, minutes, 0, 0);

    onSubmit({
      guestId: guest?.id,
      newGuest: newGuest ?? undefined,
      partySize: Number(partySize),
      dateTime: dateTime.toISOString(),
      tableId: tableId || null,
      notes,
      status: initial ? status : undefined,
    });
  }

  const canSubmit = guest || (newGuest && newGuest.firstName && newGuest.lastName);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{initial ? "Edit reservation" : "New reservation"}</h2>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mb-3">
          <span className="mb-1 block text-sm font-medium text-gray-700">Guest</span>
          <GuestPicker
            selectedGuest={guest}
            onSelectGuest={setGuest}
            newGuest={newGuest}
            onChangeNewGuest={setNewGuest}
          />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Party size</span>
            <input
              type="number"
              required
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Time</span>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Table (optional)</span>
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            <option value="">Unassigned</option>
            {tables?.map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.number} ({t.capacity} seats)
              </option>
            ))}
          </select>
        </label>

        {initial && (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ReservationStatus)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mb-5 block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="Allergies, special requests, occasion..."
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <div>
            {onCancelReservation && initial && initial.status !== "CANCELLED" && (
              <button
                type="button"
                onClick={onCancelReservation}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cancel reservation
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
