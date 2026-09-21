import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Guest } from "../lib/reservations";
import { TagBadge } from "../components/TagBadge";

export function GuestbookPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: guests, isLoading, isError } = useQuery<Guest[]>({
    queryKey: ["guests", "list", debounced],
    queryFn: () => api.get("/guests", { params: debounced ? { search: debounced } : {} }).then((res) => res.data),
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Guestbook</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Search guests or browse the full list.</p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, phone, or email..."
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading guests...</div>}
      {isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load guests.</div>}

      {guests && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {guests.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">No guests found.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {guests.map((g) => (
                <li key={g.id}>
                  <Link to={`/guests/${g.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {g.firstName} {g.lastName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{g.phone || g.email || "No contact info"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {[...g.tags.map((tag) => ({ tag, auto: false })), ...g.autoTags.map((tag) => ({ tag, auto: true }))]
                        .slice(0, 3)
                        .map(({ tag, auto }) => (
                          <TagBadge key={`${auto ? "auto" : "manual"}-${tag}`} tag={tag} auto={auto} />
                        ))}
                      <span className="text-xs text-gray-400 dark:text-gray-500">{g.visitCount} visits</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
