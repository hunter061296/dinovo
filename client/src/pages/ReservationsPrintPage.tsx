import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Reservation } from "../lib/reservations";
import { PRINT_COLUMNS, toCsv, toPrintRow, downloadCsv } from "../lib/reservationsPrint";

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

export function ReservationsPrintPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") || todayLocalISODate());

  const { data: reservations, isLoading, isError } = useQuery<Reservation[]>({
    queryKey: ["reservations", date],
    queryFn: () => api.get("/reservations", { params: { date } }).then((res) => res.data),
  });

  const rows = (reservations ?? [])
    .slice()
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    .map(toPrintRow);

  function handleExport() {
    downloadCsv(`reservations-${date}.csv`, toCsv(rows));
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6 print:p-0">
      {/* Screen-only toolbar — hidden entirely when printing so only the table shows. This page
          renders outside the app's <Layout>, so there's no nav/sidebar to hide separately. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link to="/reservations" className="text-sm text-accent-600 hover:underline">
            ← Back to Reservation Book
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">Reservations — print view</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSearchParams({ date: e.target.value });
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            onClick={handleExport}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
          >
            Print
          </button>
        </div>
      </div>

      {/* Payment status is deliberately omitted from this list (and the CSV export) — Dinovo has
          no POS/payment integration, so there's nothing real to show there. See NOTES.md. */}
      <p className="text-xs text-gray-400 dark:text-gray-500 print:hidden">
        No "Payment status" column — Dinovo has no POS integration to source it from.
      </p>

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400 print:hidden">Loading reservations...</div>}
      {isError && <div className="text-sm text-red-600 dark:text-red-400 print:hidden">Failed to load reservations.</div>}

      {reservations && (
        <div>
          <h2 className="mb-2 hidden text-lg font-semibold print:block">
            Reservations — {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </h2>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                {PRINT_COLUMNS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-2 py-2 font-semibold text-gray-700 dark:text-gray-300 print:text-black">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={PRINT_COLUMNS.length} className="px-2 py-4 text-center text-gray-400 dark:text-gray-500">
                    No reservations for this date.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700 print:border-gray-300">
                    {PRINT_COLUMNS.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-gray-700 dark:text-gray-300 print:text-black">
                        {row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
