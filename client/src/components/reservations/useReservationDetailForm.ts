import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { RestaurantTable } from "../../lib/tables";
import type { Reservation, ReservationFormValues, ReservationStatus, Shift } from "../../lib/reservations";
import type { GuestDetail } from "../../lib/guests";
import { coversInSlot, findPacingRule } from "../../lib/pacing";
import type { NewGuestInput } from "./GuestPicker";

function toTimeInputValue(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

interface Options {
  date: string; // YYYY-MM-DD, used to default/build the time field
  shifts: Shift[];
  reservationsThatDay: Reservation[];
  initial?: Reservation;
}

// Shared state + logic behind every "view/edit a reservation" surface — the modal
// (ReservationFormModal) and the Floor Plan's embedded panel (FloorPlanReservationPanel) both use
// this, so the guest picker, tags, notes, pacing-warning calc, and notify-stub wiring can't drift
// apart between the two. Each caller renders its own layout around these fields/handlers.
export function useReservationDetailForm({ date, shifts, reservationsThatDay, initial }: Options) {
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

  // Feeds the mini guest-stats block — the embedded `guest` on a Reservation doesn't include this
  // guest's other reservations, so a dedicated fetch is needed for "Upcoming".
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

  function buildValues(): ReservationFormValues {
    const [hours, minutes] = time.split(":").map(Number);
    const dateTime = new Date(`${date}T00:00:00`);
    dateTime.setHours(hours, minutes, 0, 0);

    return {
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
    };
  }

  const canSubmit = !!(guest || (newGuest && newGuest.firstName && newGuest.lastName));

  return {
    guest,
    setGuest,
    newGuest,
    setNewGuest,
    partySize,
    setPartySize,
    time,
    setTime,
    tableId,
    setTableId,
    status,
    setStatus,
    tags,
    newTag,
    setNewTag,
    toggleTag,
    addCustomTag,
    generalNote,
    setGeneralNote,
    offerNote,
    setOfferNote,
    foodDrinkNote,
    setFoodDrinkNote,
    seatingNote,
    setSeatingNote,
    excludeFromPacing,
    setExcludeFromPacing,
    notified,
    notifying,
    handleNotify,
    tables,
    guestDetail,
    upcomingCount,
    pacingWarning,
    buildValues,
    canSubmit,
  };
}
