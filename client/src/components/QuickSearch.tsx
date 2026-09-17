import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Guest } from "../lib/reservations";

export function QuickSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const { data: results, isFetching } = useQuery<Guest[]>({
    queryKey: ["guests", "quick-search", debounced],
    queryFn: () => api.get("/guests", { params: { search: debounced } }).then((res) => res.data),
    enabled: debounced.length >= 2,
  });

  function goToGuest(id: string) {
    navigate(`/guests/${id}`);
    setQuery("");
    setDebounced("");
    setOpen(false);
  }

  const showDropdown = open && debounced.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search guests by name or phone..."
          className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
        />
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {isFetching && !results && <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Searching...</p>}
          {results && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No guests found.</p>
          )}
          {results?.map((g) => (
            <button
              key={g.id}
              onClick={() => goToGuest(g.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {g.firstName} {g.lastName}
              </span>
              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{g.phone ?? g.email ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
