import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../lib/api";
import type { Reservation, Shift } from "../../lib/reservations";
import { minutesToLabel } from "../../lib/reservations";
import { coversInSlot, findPacingRule } from "../../lib/pacing";
import type { RestaurantTable } from "../../lib/tables";
import { GuestPicker, type NewGuestInput } from "./GuestPicker";
import { MiniCalendar } from "./MiniCalendar";
import type { ReservationFormValues } from "./ReservationFormModal";
import { ModalBackdrop, ModalPanel } from "../Modal";
import { DURATION, useMotionDuration } from "../../lib/motion";

// Slide distance is deliberately small (24px) — this should read as a quick directional cue
// between steps, not a slide-show transition.
const stepVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -24 : 24, opacity: 0 }),
};

const STEPS = ["Date", "Party", "Time", "Guest", "Summary"] as const;
type Step = (typeof STEPS)[number];
const SLOT_MINUTES = 30;
const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function formatDateHeading(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

interface Props {
  initialDate?: string;
  onSubmit: (values: ReservationFormValues) => void;
  onClose: () => void;
  submitting?: boolean;
  error?: string | null;
}

export function ReservationWizardModal({ initialDate, onSubmit, onClose, submitting, error }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  // +1 = advancing via Next (slide in from the right), -1 = Back (slide in from the left).
  const [direction, setDirection] = useState(1);
  const stepDuration = useMotionDuration(DURATION.fast);
  const [date, setDate] = useState(initialDate ?? todayLocalISODate());
  const [partySize, setPartySize] = useState<number>(2);
  const [slotMinutes, setSlotMinutes] = useState<number | null>(null);
  const [guest, setGuest] = useState<Reservation["guest"] | null>(null);
  const [newGuest, setNewGuest] = useState<NewGuestInput | null>(null);
  const [tableId, setTableId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const step: Step = STEPS[stepIndex];

  const { data: shifts } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: () => api.get("/shifts").then((res) => res.data),
  });
  const { data: reservationsThatDay } = useQuery<Reservation[]>({
    queryKey: ["reservations", date],
    queryFn: () => api.get("/reservations", { params: { date } }).then((res) => res.data),
  });
  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const shiftsThatDay = useMemo(() => (shifts ?? []).filter((s) => s.dayOfWeek === dayOfWeek), [shifts, dayOfWeek]);

  const timeSlots = useMemo(() => {
    const result: number[] = [];
    for (const shift of shiftsThatDay) {
      for (let m = shift.startMinutes; m < shift.endMinutes; m += SLOT_MINUTES) {
        result.push(m);
      }
    }
    return result.sort((a, b) => a - b);
  }, [shiftsThatDay]);

  function pacingInfoFor(slot: number) {
    const rule = findPacingRule(shifts ?? [], slot);
    if (!rule) return null;
    const projected = coversInSlot(reservationsThatDay ?? [], slot) + partySize;
    return { rule, projected, overCap: projected > rule.maxCovers, overPartySize: partySize > rule.maxPartySize };
  }

  const selectedSlotWarning = useMemo(() => {
    if (slotMinutes === null) return null;
    const info = pacingInfoFor(slotMinutes);
    if (!info) return null;
    const messages: string[] = [];
    if (info.overCap) messages.push(`This slot would have ${info.projected}/${info.rule.maxCovers} covers.`);
    if (info.overPartySize) messages.push(`Party size ${partySize} exceeds this slot's max of ${info.rule.maxPartySize}.`);
    return messages.length > 0 ? messages.join(" ") : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotMinutes, shifts, reservationsThatDay, partySize]);

  function canAdvance(): boolean {
    if (step === "Date") return !!date;
    if (step === "Party") return partySize > 0;
    if (step === "Time") return slotMinutes !== null;
    if (step === "Guest") return !!guest || !!(newGuest && newGuest.firstName && newGuest.lastName);
    return true;
  }

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setDirection(1);
      setStepIndex((i) => i + 1);
    }
  }
  function goBack() {
    if (stepIndex > 0) {
      setDirection(-1);
      setStepIndex((i) => i - 1);
    }
  }

  function handleConfirm() {
    if (slotMinutes === null) return;
    const dateTime = new Date(`${date}T00:00:00`);
    dateTime.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
    onSubmit({
      guestId: guest?.id,
      newGuest: newGuest ?? undefined,
      partySize,
      dateTime: dateTime.toISOString(),
      tableId: tableId || null,
      generalNote: notes,
    });
  }

  return (
    <ModalBackdrop>
      <ModalPanel className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-lg dark:bg-gray-800">
        {/* Step indicator */}
        <div className="flex items-center gap-1 border-b border-gray-100 px-5 pb-3 pt-4 dark:border-gray-700">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-1">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  i < stepIndex
                    ? "bg-accent-600 text-white"
                    : i === stepIndex
                      ? "border-2 border-accent-600 text-accent-600 dark:text-accent-400"
                      : "border border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500"
                }`}
              >
                {i < stepIndex ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < stepIndex ? "bg-accent-600" : "bg-gray-200 dark:bg-gray-700"}`} />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden px-5 py-4">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: stepDuration, ease: "easeInOut" }}
            className="h-full overflow-y-auto"
          >
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {step === "Date" && "Pick a date"}
            {step === "Party" && "Party size"}
            {step === "Time" && "Pick a time"}
            {step === "Guest" && "Guest details"}
            {step === "Summary" && "Confirm reservation"}
          </h2>

          {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

          {step === "Date" && (
            <div className="flex justify-center">
              <MiniCalendar selected={date} onSelect={setDate} />
            </div>
          )}

          {step === "Party" && (
            <div className="grid grid-cols-4 gap-2">
              {PARTY_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPartySize(n)}
                  className={`rounded-md border px-3 py-3 text-sm font-medium ${
                    partySize === n
                      ? "border-accent-600 bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {n} {n === 1 ? "guest" : "guests"}
                </button>
              ))}
              <label className="col-span-4 mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                Or enter exact size:
                <input
                  type="number"
                  min={1}
                  value={partySize}
                  onChange={(e) => setPartySize(Number(e.target.value) || 1)}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
            </div>
          )}

          {step === "Time" && (
            <div>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{formatDateHeading(date)} · {partySize} guests</p>
              {timeSlots.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">No shifts configured for this day.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((m) => {
                    const info = pacingInfoFor(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSlotMinutes(m)}
                        className={`rounded-md border px-2 py-2 text-sm font-medium ${
                          slotMinutes === m
                            ? "border-accent-600 bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300"
                            : info?.overCap
                              ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                              : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        }`}
                      >
                        {minutesToLabel(m)}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedSlotWarning && (
                <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  ⚠ {selectedSlotWarning}
                </div>
              )}
            </div>
          )}

          {step === "Guest" && (
            <GuestPicker selectedGuest={guest} onSelectGuest={setGuest} newGuest={newGuest} onChangeNewGuest={setNewGuest} />
          )}

          {step === "Summary" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-600">
                <div className="flex justify-between py-1">
                  <span className="text-gray-500 dark:text-gray-400">Date</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatDateHeading(date)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500 dark:text-gray-400">Party size</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{partySize}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500 dark:text-gray-400">Time</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{slotMinutes !== null ? minutesToLabel(slotMinutes) : "—"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500 dark:text-gray-400">Guest</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {guest ? `${guest.firstName} ${guest.lastName}` : newGuest ? `${newGuest.firstName} ${newGuest.lastName}` : "—"}
                  </span>
                </div>
              </div>

              <label className="block text-sm">
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

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Allergies, special requests, occasion..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
            </div>
          )}
          </motion.div>
        </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-700">
          <button
            type="button"
            onClick={stepIndex === 0 ? onClose : goBack}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {stepIndex === 0 ? "Cancel" : "Back"}
          </button>
          {step === "Summary" ? (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {submitting ? "Booking..." : "Confirm reservation"}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!canAdvance()}
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              Next
            </button>
          )}
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
