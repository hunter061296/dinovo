import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import type { RestaurantTable, TableStatus } from "../lib/tables";
import type { WaitlistEntry } from "../lib/waitlist";
import type { Reservation } from "../lib/reservations";
import { wasTableSelfUpdated } from "../lib/selfUpdatedTables";
import { wasWaitlistEntrySelfUpdated, wasReservationSelfCreated } from "../lib/selfInitiated";

const STATUS_TOAST_TEXT: Record<TableStatus, string> = {
  OPEN: "opened",
  SEATED: "seated",
  ORDERED: "ordered",
  NEEDS_CLEANING: "needs cleaning",
};

// Ambient, low-key notifications for background events that originated from some OTHER screen —
// mounted once in Layout so they show up no matter which page a host is currently on. Same
// "was this my own action" distinction as the floor plan's remote-update highlight (step 3):
// skip anything this screen just did itself, since that already has instant local feedback.
export function SocketToasts() {
  // Own record of each table's last-known status, seeded from its own fetch (not another page's
  // react-query cache, which may not exist yet — this is mounted globally in Layout and has to
  // work no matter which page a host is currently on) so "did the status actually change" is
  // never a race with, or dependent on, some other component happening to have fetched tables.
  const lastTableStatus = useRef<Map<string, TableStatus>>(new Map());

  useEffect(() => {
    let cancelled = false;
    api.get<RestaurantTable[]>("/tables").then((res) => {
      if (cancelled) return;
      for (const t of res.data) lastTableStatus.current.set(t.id, t.status);
    });

    const socket = getSocket();

    const onTableUpdated = (table: RestaurantTable) => {
      const previousStatus = lastTableStatus.current.get(table.id);
      lastTableStatus.current.set(table.id, table.status);
      // previousStatus is undefined the first time we see a table (nothing to compare against
      // yet) — skip rather than guess. Only a genuine status change (not a drag/layout edit)
      // is toast-worthy.
      if (previousStatus && previousStatus !== table.status && !wasTableSelfUpdated(table.id)) {
        toast(`Table ${table.number} ${STATUS_TOAST_TEXT[table.status]}`);
      }
    };

    const onWaitlistUpdated = (entry: WaitlistEntry) => {
      if (entry.status === "SEATED" && !wasWaitlistEntrySelfUpdated(entry.id)) {
        toast(`${entry.guestName} seated`);
      }
    };

    const onReservationCreated = (reservation: Reservation) => {
      if (!wasReservationSelfCreated()) {
        toast(`New reservation: ${reservation.guest.lastName}, party of ${reservation.partySize}`);
      }
    };

    socket.on("table:updated", onTableUpdated);
    socket.on("waitlist:updated", onWaitlistUpdated);
    socket.on("reservation:created", onReservationCreated);
    return () => {
      cancelled = true;
      socket.off("table:updated", onTableUpdated);
      socket.off("waitlist:updated", onWaitlistUpdated);
      socket.off("reservation:created", onReservationCreated);
    };
  }, []);

  return null;
}
