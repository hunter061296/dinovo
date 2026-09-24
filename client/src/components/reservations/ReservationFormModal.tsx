import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { RestaurantTable } from "../../lib/tables";
import type { Reservation, ReservationStatus, Shift } from "../../lib/reservations";
import { STATUS_BANNER_STYLES, STATUS_LABELS, SUGGESTED_RESERVATION_TAGS } from "../../lib/reservations";
import type { GuestDetail } from "../../lib/guests";
import { coversInSlot, findPacingRule } from "../../lib/pacing";
import { GuestPicker, type NewGuestInput } from "./GuestPicker";
import { ModalBackdrop, ModalPanel } from "../Modal";
import { TagBadge } from "../TagBadge";

export interface ReservationFormValues {
  guestId?: string;
  newGuest?: NewGuestInput;
  partySize: number;
  dateTime: string; // ISO
  tableId: string | null;
  tags?: string[];
  generalNote?: string;
  offerNote?: string;
  foodDrinkNote?: string;
  seatingNote?: string;
  excludeFromPacing?: boolean;
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
  const [status, setStatus] = useState<ReservationStatus>(initial?.status ?? "BOOKED");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [newTag, setNewTag] = useState("");
  const [generalNote, setGeneralNote] = useState(initial?.generalNote ?? "");
  const [offerNote, setOfferNote] = useState(initial?.offerNote ?? "");
  const [foodDrinkNote, setFoodDrinkNote] = useState(initial?.foodDrinkNote ?? "");
  const [seatingNote, setSeatingNote] = useState(initial?.seatingNote ?? "");
  const [excludeFromPacing, setExcludeFromPacing] = useState(initial?.excludeFromPacing ?? false);
  const [notified, setNotified] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  // Feeds the mini guest-stats block below — the embedded `guest` on a Reservation doesn't
  // include this guest's other reservations, so a dedicated fetch is needed for "Upcoming".
  const { data: guestDetail } = useQuery<GuestDetail>({
    queryKey: ["guests", initial?.guestId],
    queryFn: () => api.get(`/guests/${initial!.guestId}`).then((res) => res.data),
    enabled: !!initial?.guestId,
  });
  const upcomingCount = (guestDetail?.reservations ?? []).filter((r) => r.status === "BOOKED" && r.id !== initial?.id).length;

  // Non-blocking pacing check: warn if this booking would push the slot over its configured
  // cover cap or exceed the slot's max party size, but never prevent saving. Mirrors the
  // excludeFromPacing exemption in server/src/lib/pacing.ts's checkPacingCap.
  const pacingWarning = useMemo(() => {
    const [hours, minutes] = time.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    const slot = hours * 60 + minutes - ((hours * 60 + minutes) % 30);
    const rule = findPacingRule(shifts, slot);
    if (!rule) return null;

    const size = Number(partySize) || 0;
    const messages: string[] = [];
    if (!excludeFromPacing) {
      const existingCovers = coversInSlot(reservationsThatDay, slot, initial?.id);
      const projected = existingCovers + size;
      if (projected > rule.maxCovers) {
        messages.push(`This slot would have ${projected}/${rule.maxCovers} covers.`);
      }
    }
    if (size > rule.maxPartySize) {
      messages.push(`Party size ${size} exceeds this slot's max of ${rule.maxPartySize}.`);
    }
    return messages.length > 0 ? messages.join(" ") : null;
  }, [time, partySize, shifts, reservationsThatDay, initial?.id, excludeFromPacing]);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function addCustomTag() {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setNewTag("");
  }

  async function handleNotify() {
    if (!initial?.guestId) return;
    setNotifying(true);
    try {
      await api.post(`/guests/${initial.guestId}/notify`);
      setNotified(true);
    } finally {
      setNotifying(false);
    }
  }

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
      tags,
      generalNote,
      offerNote,
      foodDrinkNote,
      seatingNote,
      excludeFromPacing,
      status: initial ? status : undefined,
    });
  }

  const canSubmit = guest || (newGuest && newGuest.firstName && newGuest.lastName);

  return (
    <ModalBackdrop>
      <ModalPanel
        as="form"
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-lg dark:bg-gray-800"
      >
        {/* Status banner — styled prominently like OpenTable's reservation panel, not a small badge. */}
        {initial && (
          <div className={`px-5 py-3 text-sm font-semibold ${STATUS_BANNER_STYLES[initial.status]}`}>
            {STATUS_LABELS[initial.status]}
          </div>
        )}

        <div className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{initial ? "Reservation details" : "New reservation"}</h2>

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

          {/* Mini guest-stats block — full detail lives on the Guest Profile page (linked below). */}
          {initial && (
            <div className="mb-4 grid grid-cols-4 gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/40">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Visits</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{guestDetail?.visitCount ?? initial.guest.visitCount}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Upcoming</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{upcomingCount}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Cancellations</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {guestDetail?.cancellationCount ?? initial.guest.cancellationCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">No-shows</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{guestDetail?.noShowCount ?? initial.guest.noShowCount}</div>
              </div>
              <div className="col-span-4 mt-1 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                <Link to={`/guests/${initial.guestId}`} className="text-xs font-medium text-accent-600 hover:underline">
                  View full profile →
                </Link>
                {notified ? (
                  <span className="text-xs text-green-700 dark:text-green-400">✓ Notified (stub — no real message sent)</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleNotify}
                    disabled={notifying}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {notifying ? "Sending..." : "Message guest"}
                  </button>
                )}
              </div>
            </div>
          )}

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

          <div className="mb-3">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Occasion tags</span>
            <div className="mb-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <TagBadge key={tag} tag={tag} onRemove={() => toggleTag(tag)} />
              ))}
              {tags.length === 0 && <span className="text-xs text-gray-400 dark:text-gray-500">No tags for this visit.</span>}
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {SUGGESTED_RESERVATION_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  + {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                placeholder="Custom tag..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={addCustomTag}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Add
              </button>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">General note</span>
              <textarea
                value={generalNote}
                onChange={(e) => setGeneralNote(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="Anything else worth knowing..."
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Offer note</span>
              <textarea
                value={offerNote}
                onChange={(e) => setOfferNote(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="Promo, comp, package..."
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Food &amp; drink note</span>
              <textarea
                value={foodDrinkNote}
                onChange={(e) => setFoodDrinkNote(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="Allergies, dietary needs, favorites..."
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Seating note</span>
              <textarea
                value={seatingNote}
                onChange={(e) => setSeatingNote(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="Booth, patio, away from kitchen..."
              />
            </label>
          </div>

          <label className="mb-5 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={excludeFromPacing}
              onChange={(e) => setExcludeFromPacing(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Exclude party from pacing limit
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
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
