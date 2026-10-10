import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Reservation, ReservationFormValues, ReservationStatus, Shift } from "../../lib/reservations";
import { STATUS_BANNER_STYLES, STATUS_LABELS, SUGGESTED_RESERVATION_TAGS } from "../../lib/reservations";
import { GuestPicker } from "../reservations/GuestPicker";
import { useReservationDetailForm } from "../reservations/useReservationDetailForm";
import { TagBadge } from "../TagBadge";

interface Props {
  date: string;
  shifts: Shift[];
  reservationsThatDay: Reservation[];
  initial: Reservation;
  onSubmit: (values: ReservationFormValues) => void;
  onCancelReservation: () => void;
  onBack: () => void;
  submitting?: boolean;
  error?: string | null;
}

// The Floor Plan's "click a guest's name" destination — loads in place of the canvas (see
// FloorPlanPage) rather than as a floating dialog, OpenTable-style: a two-column layout (fields
// on the left, status/guest-stats/actions on the right) that scrolls internally within a fixed
// page shell instead of growing the whole page.
export function FloorPlanReservationPanel({
  date,
  shifts,
  reservationsThatDay,
  initial,
  onSubmit,
  onCancelReservation,
  onBack,
  submitting,
  error,
}: Props) {
  const f = useReservationDetailForm({ date, shifts, reservationsThatDay, initial });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(f.buildValues());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Status banner doubles as the header — a back action instead of a floating X, since this
          panel replaces the canvas rather than overlaying it. */}
      <div className={`flex shrink-0 items-center justify-between gap-2 px-5 py-3 text-sm font-semibold ${STATUS_BANNER_STYLES[initial.status]}`}>
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 hover:underline">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 010 1.06L8.06 11l4.73 4.71a.75.75 0 11-1.06 1.06l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
          Back to floor plan
        </button>
        <span>{STATUS_LABELS[initial.status]}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}
        {f.pacingWarning && (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            ⚠ {f.pacingWarning}
          </div>
        )}

        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Main column */}
          <div className="min-w-0 flex-1">
            <div className="mb-4">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Guest</span>
              <GuestPicker selectedGuest={f.guest} onSelectGuest={f.setGuest} newGuest={f.newGuest} onChangeNewGuest={f.setNewGuest} />
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Party size</span>
                <input
                  type="number"
                  required
                  min={1}
                  value={f.partySize}
                  onChange={(e) => f.setPartySize(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Time</span>
                <input
                  type="time"
                  required
                  value={f.time}
                  onChange={(e) => f.setTime(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Table (optional)</span>
                <select
                  value={f.tableId}
                  onChange={(e) => f.setTableId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">Unassigned</option>
                  {f.tables?.map((t) => (
                    <option key={t.id} value={t.id}>
                      Table {t.number} ({t.capacity} seats)
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mb-4">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Occasion tags</span>
              <div className="mb-2 flex flex-wrap gap-2">
                {f.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} onRemove={() => f.toggleTag(tag)} />
                ))}
                {f.tags.length === 0 && <span className="text-xs text-gray-400 dark:text-gray-500">No tags for this visit.</span>}
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                {SUGGESTED_RESERVATION_TAGS.filter((t) => !f.tags.includes(t)).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => f.toggleTag(tag)}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={f.newTag}
                  onChange={(e) => f.setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      f.addCustomTag();
                    }
                  }}
                  placeholder="Custom tag..."
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={f.addCustomTag}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">General note</span>
                <textarea
                  value={f.generalNote}
                  onChange={(e) => f.setGeneralNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Anything else worth knowing..."
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Offer note</span>
                <textarea
                  value={f.offerNote}
                  onChange={(e) => f.setOfferNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Promo, comp, package..."
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Food &amp; drink note</span>
                <textarea
                  value={f.foodDrinkNote}
                  onChange={(e) => f.setFoodDrinkNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Allergies, dietary needs, favorites..."
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Seating note</span>
                <textarea
                  value={f.seatingNote}
                  onChange={(e) => f.setSeatingNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Booth, patio, away from kitchen..."
                />
              </label>
            </div>
          </div>

          {/* Right column — status, guest stats, and reservation-level actions, mirroring
              OpenTable's right sidebar. */}
          <div className="w-full shrink-0 lg:w-72">
            <div className="mb-4 rounded-md border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-2 p-3 text-center">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Visits</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {f.guestDetail?.visitCount ?? initial.guest.visitCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Upcoming</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{f.upcomingCount}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Cancellations</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {f.guestDetail?.cancellationCount ?? initial.guest.cancellationCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">No-shows</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {f.guestDetail?.noShowCount ?? initial.guest.noShowCount}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3 py-2 dark:border-gray-700">
                <Link to={`/guests/${initial.guestId}`} className="text-xs font-medium text-accent-600 hover:underline">
                  View full profile →
                </Link>
              </div>
            </div>

            <button
              type="button"
              onClick={f.handleNotify}
              disabled={f.notifying || f.notified}
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {f.notified ? "✓ Notified (stub — no real message sent)" : f.notifying ? "Sending..." : "Message guest"}
            </button>

            <label className="mb-4 block text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Status</span>
              <select
                value={f.status}
                onChange={(e) => f.setStatus(e.target.value as ReservationStatus)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={f.excludeFromPacing}
                onChange={(e) => f.setExcludeFromPacing(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Exclude party from pacing limit
            </label>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-700">
        <div>
          {initial.status !== "CANCELLED" && (
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
            onClick={onBack}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={submitting || !f.canSubmit}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
