import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { RestaurantTable } from "../../lib/tables";
import type { Reservation, ReservationStatus, Shift } from "../../lib/reservations";
import { STATUS_LABELS } from "../../lib/reservations";
import { coversInSlot, findPacingRule } from "../../lib/pacing";
import { GuestPicker, type NewGuestInput } from "./GuestPicker";
import { ModalBackdrop, ModalPanel } from "../Modal";

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
  shifts: Shift[];
  reservationsThatDay: Reservation[];
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

export function ReservationFormModal({
  date,
  shifts,
  reservationsThatDay,
  initial,
  onSubmit,
  onCancelReservation,
  onClose,
  submitting,
  error,
}: Props) {
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

  // Non-blocking pacing check: warn if this booking would push the slot over its configured
  // cover cap or exceed the slot's max party size, but never prevent saving.
  const pacingWarning = useMemo(() => {
    const [hours, minutes] = time.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    const slot = hours * 60 + minutes - ((hours * 60 + minutes) % 30);
    const rule = findPacingRule(shifts, slot);
    if (!rule) return null;

    const size = Number(partySize) || 0;
    const existingCovers = coversInSlot(reservationsThatDay, slot, initial?.id);
    const projected = existingCovers + size;

    const messages: string[] = [];
    if (projected > rule.maxCovers) {
      messages.push(`This slot would have ${projected}/${rule.maxCovers} covers.`);
    }
    if (size > rule.maxPartySize) {
      messages.push(`Party size ${size} exceeds this slot's max of ${rule.maxPartySize}.`);
    }
    return messages.length > 0 ? messages.join(" ") : null;
  }, [time, partySize, shifts, reservationsThatDay, initial?.id]);

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
    <ModalBackdrop>
      <ModalPanel
        as="form"
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800"
      >
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{initial ? "Edit reservation" : "New reservation"}</h2>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}
        {pacingWarning && (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            ⚠ {pacingWarning}
          </div>
        )}

        <div className="mb-3">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Guest</span>
          <GuestPicker
            selectedGuest={guest}
            onSelectGuest={setGuest}
            newGuest={newGuest}
            onChangeNewGuest={setNewGuest}
          />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Party size</span>
            <input
              type="number"
              required
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Time</span>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Table (optional)</span>
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
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
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ReservationStatus)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
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
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            placeholder="Allergies, special requests, occasion..."
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <div>
            {onCancelReservation && initial && initial.status !== "CANCELLED" && (
              <button
                type="button"
                onClick={onCancelReservation}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                Cancel reservation
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
