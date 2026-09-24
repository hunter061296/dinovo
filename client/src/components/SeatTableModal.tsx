import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { RestaurantTable } from "../lib/tables";
import { ModalBackdrop, ModalCloseButton, ModalPanel } from "./Modal";

interface Props {
  title: string;
  subtitle: string;
  partySize: number;
  preferredTableId?: string | null;
  onSeat: (tableId: string) => void;
  onClose: () => void;
  submitting?: boolean;
  // Only offered for a Reservation, not a Waitlist entry — assigning a table ahead of time only
  // makes sense for a party with a known future time; a walk-in on the waitlist is already here.
  onPreAssign?: (tableId: string) => void;
}

type Mode = "preassign" | "seat";

export function SeatTableModal({ title, subtitle, partySize, preferredTableId, onSeat, onClose, submitting, onPreAssign }: Props) {
  const showTabs = !!onPreAssign;
  const [mode, setMode] = useState<Mode>(showTabs ? "preassign" : "seat");

  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });

  const bigEnough = (tables ?? []).filter((t) => t.capacity >= partySize);
  const sortByPreferred = (list: RestaurantTable[]) =>
    [...list].sort((a, b) => (a.id === preferredTableId ? -1 : b.id === preferredTableId ? 1 : a.number - b.number));

  // Seating happens right now, so only a currently-open table qualifies. Pre-assigning is for a
  // future time — the table may be occupied by an earlier party today and free up by then, so any
  // table big enough is offered; the server's own conflict check still blocks a genuine double-book.
  const seatCandidates = sortByPreferred(bigEnough.filter((t) => t.status === "OPEN"));
  const preAssignCandidates = sortByPreferred(bigEnough);
  const candidates = mode === "seat" ? seatCandidates : preAssignCandidates;

  return (
    <ModalBackdrop>
      <ModalPanel className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <ModalCloseButton onClick={onClose} />
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>

        {showTabs && (
          <div className="mb-4 flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setMode("preassign")}
              className={`flex-1 border-b-2 pb-2 text-sm font-medium ${
                mode === "preassign"
                  ? "border-accent-600 text-accent-700 dark:text-accent-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              Pre-Assign
            </button>
            <button
              onClick={() => setMode("seat")}
              className={`flex-1 border-b-2 pb-2 text-sm font-medium ${
                mode === "seat"
                  ? "border-accent-600 text-accent-700 dark:text-accent-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              Seat
            </button>
          </div>
        )}

        {candidates.length === 0 ? (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            {mode === "seat"
              ? "No open tables large enough right now. Free one up on the Floor Plan first."
              : "No tables large enough for this party."}
          </p>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {candidates.map((t) => (
              <button
                key={t.id}
                onClick={() => (mode === "seat" ? onSeat(t.id) : onPreAssign!(t.id))}
                disabled={submitting}
                className={`rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent-50 hover:border-accent-300 disabled:opacity-60 dark:hover:bg-accent-900/30 ${
                  t.id === preferredTableId
                    ? "border-accent-400 bg-accent-50 text-accent-700 dark:border-accent-600 dark:bg-accent-900/30 dark:text-accent-300"
                    : "border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300"
                }`}
              >
                Table {t.number} <span className="text-gray-400 dark:text-gray-500">({t.capacity} seats)</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
