import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { minutesSince, type WaitlistEntry } from "../lib/waitlist";
import { SeatNowModal } from "../components/waitlist/SeatNowModal";

export function WaitlistPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ guestName: "", phone: "", partySize: "2" });
  const [formError, setFormError] = useState<string | null>(null);
  const [seating, setSeating] = useState<WaitlistEntry | null>(null);
  const [lastQuote, setLastQuote] = useState<number | null>(null);

  // Forces a re-render every 30s so "waiting X min" stays roughly live without polling the server.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: entries, isLoading, isError } = useQuery<WaitlistEntry[]>({
    queryKey: ["waitlist"],
    queryFn: () => api.get("/waitlist").then((res) => res.data),
  });

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["waitlist"] });
    socket.on("waitlist:created", refresh);
    socket.on("waitlist:updated", refresh);
    return () => {
      socket.off("waitlist:created", refresh);
      socket.off("waitlist:updated", refresh);
    };
  }, [queryClient]);

  const addWalkIn = useMutation({
    mutationFn: () =>
      api.post("/waitlist", { ...form, partySize: Number(form.partySize) }).then((res) => res.data as WaitlistEntry),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      setForm({ guestName: "", phone: "", partySize: "2" });
      setFormError(null);
      setLastQuote(entry.quotedWaitMinutes);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to add to waitlist"),
  });

  const cancelEntry = useMutation({
    mutationFn: (id: string) => api.patch(`/waitlist/${id}`, { status: "CANCELLED" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["waitlist"] }),
  });

  const seatEntry = useMutation({
    mutationFn: ({ id, tableId }: { id: string; tableId: string }) => api.post(`/waitlist/${id}/seat`, { tableId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      setSeating(null);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLastQuote(null);
    addWalkIn.mutate();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Waitlist</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Add walk-ins and seat them as tables open up.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 p-4">
        {formError && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{formError}</div>}
        {lastQuote !== null && (
          <div className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
            Added — quoted wait: {lastQuote === 0 ? "seat right away" : `~${lastQuote} min`}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            required
            placeholder="Name"
            value={form.guestName}
            onChange={(e) => setForm({ ...form, guestName: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <input
            type="number"
            required
            min={1}
            placeholder="Party size"
            value={form.partySize}
            onChange={(e) => setForm({ ...form, partySize: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          disabled={addWalkIn.isPending}
          className="mt-3 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {addWalkIn.isPending ? "Adding..." : "Add to waitlist"}
        </button>
      </form>

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading waitlist...</div>}
      {isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load the waitlist.</div>}

      {entries && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {entries.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">No one is waiting right now.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {entry.guestName} · {entry.partySize}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.phone ? `${entry.phone} · ` : ""}
                      Waiting {minutesSince(entry.addedAt)} min (quoted ~{entry.quotedWaitMinutes} min)
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setSeating(entry)}
                      className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
                    >
                      Seat now
                    </button>
                    <button
                      onClick={() => cancelEntry.mutate(entry.id)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {seating && (
        <SeatNowModal
          entry={seating}
          submitting={seatEntry.isPending}
          onClose={() => setSeating(null)}
          onSeat={(tableId) => seatEntry.mutate({ id: seating.id, tableId })}
        />
      )}
    </div>
  );
}
