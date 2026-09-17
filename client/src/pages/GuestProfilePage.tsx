import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { SUGGESTED_TAGS, type GuestDetail } from "../lib/guests";
import { STATUS_LABELS, STATUS_STYLES } from "../lib/reservations";

export function GuestProfilePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: guest, isLoading, isError } = useQuery<GuestDetail>({
    queryKey: ["guests", id],
    queryFn: () => api.get(`/guests/${id}`).then((res) => res.data),
    enabled: !!id,
  });

  const [notes, setNotes] = useState("");
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    if (guest) setNotes(guest.notes ?? "");
  }, [guest]);

  const updateGuest = useMutation({
    mutationFn: (data: { tags?: string[]; notes?: string }) => api.patch(`/guests/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guests", id] }),
  });

  function toggleTag(tag: string) {
    if (!guest) return;
    const has = guest.tags.includes(tag);
    updateGuest.mutate({ tags: has ? guest.tags.filter((t) => t !== tag) : [...guest.tags, tag] });
  }

  function addCustomTag() {
    if (!guest || !newTag.trim() || guest.tags.includes(newTag.trim())) return;
    updateGuest.mutate({ tags: [...guest.tags, newTag.trim()] });
    setNewTag("");
  }

  if (isLoading) return <div className="text-sm text-gray-500 dark:text-gray-400">Loading guest...</div>;
  if (isError || !guest) return <div className="text-sm text-red-600 dark:text-red-400">Guest not found.</div>;

  const completedVisits = guest.reservations.filter((r) => r.status === "COMPLETED");
  const lastVisit = completedVisits[0] ?? guest.reservations[0];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link to="/guests" className="text-sm text-accent-600 hover:underline">
          ← Back to Guestbook
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          {guest.firstName} {guest.lastName}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {guest.phone || "No phone"} · {guest.email || "No email"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 p-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Visit count</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{guest.visitCount}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Last visit</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {lastVisit ? new Date(lastVisit.dateTime).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Tags</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {guest.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="flex items-center gap-1 rounded-full bg-accent-100 px-3 py-1 text-xs font-medium text-accent-700 hover:bg-accent-200 dark:bg-accent-800/40 dark:text-accent-300 dark:hover:bg-accent-800/60"
            >
              {tag} <span aria-hidden>×</span>
            </button>
          ))}
          {guest.tags.length === 0 && <span className="text-xs text-gray-400 dark:text-gray-500">No tags yet.</span>}
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          {SUGGESTED_TAGS.filter((t) => !guest.tags.includes(t)).map((tag) => (
            <button
              key={tag}
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
            onKeyDown={(e) => e.key === "Enter" && addCustomTag()}
            placeholder="Custom tag..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            onClick={addCustomTag}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          placeholder="Allergies, preferences, special occasions..."
        />
        <button
          onClick={() => updateGuest.mutate({ notes })}
          disabled={updateGuest.isPending}
          className="mt-2 rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          Save notes
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300">Visit history</h2>
        {guest.reservations.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 dark:text-gray-500">No reservations yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {guest.reservations.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {new Date(r.dateTime).toLocaleDateString()} ·{" "}
                    {new Date(r.dateTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Party of {r.partySize} · {r.table ? `Table ${r.table.number}` : "Unassigned"}
                  </div>
                </div>
                <span className={`rounded-md border px-2 py-1 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                  {STATUS_LABELS[r.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
