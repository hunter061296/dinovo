import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Guest } from "../../lib/reservations";
import { GuestProfileCard } from "./GuestProfileCard";

export interface NewGuestInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

interface Props {
  selectedGuest: Guest | null;
  onSelectGuest: (guest: Guest | null) => void;
  newGuest: NewGuestInput | null;
  onChangeNewGuest: (guest: NewGuestInput | null) => void;
}

const emptyNewGuest: NewGuestInput = { firstName: "", lastName: "", phone: "", email: "" };

export function GuestPicker({ selectedGuest, onSelectGuest, newGuest, onChangeNewGuest }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results } = useQuery<Guest[]>({
    queryKey: ["guests", "search", debounced],
    queryFn: () => api.get("/guests", { params: { search: debounced } }).then((res) => res.data),
    enabled: debounced.length >= 2 && !selectedGuest && !newGuest,
  });

  if (selectedGuest) {
    return (
      <div>
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={() => onSelectGuest(null)} className="text-xs font-medium text-indigo-600 hover:underline">
            Change guest
          </button>
        </div>
        <GuestProfileCard guest={selectedGuest} />
      </div>
    );
  }

  if (newGuest) {
    return (
      <div className="rounded-md border border-gray-300 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">New guest</span>
          <button
            type="button"
            onClick={() => onChangeNewGuest(null)}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Search instead
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            placeholder="First name"
            value={newGuest.firstName}
            onChange={(e) => onChangeNewGuest({ ...newGuest, firstName: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Last name"
            value={newGuest.lastName}
            onChange={(e) => onChangeNewGuest({ ...newGuest, lastName: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Phone"
            value={newGuest.phone}
            onChange={(e) => onChangeNewGuest({ ...newGuest, phone: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Email"
            value={newGuest.email}
            onChange={(e) => onChangeNewGuest({ ...newGuest, email: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search guest by name, phone, or email..."
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      {debounced.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          {results && results.length > 0 ? (
            results.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onSelectGuest(g);
                  setSearch("");
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className="font-medium">
                  {g.firstName} {g.lastName}
                </span>
                <span className="ml-2 text-gray-500">{g.phone || g.email}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">No matches.</div>
          )}
          <button
            type="button"
            onClick={() => onChangeNewGuest({ ...emptyNewGuest, firstName: search })}
            className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + Create new guest
          </button>
        </div>
      )}
    </div>
  );
}
