import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatPercent, type ReportSummary } from "../lib/reports";
import { StatTile } from "../components/reports/StatTile";
import { ReservationsByHourChart } from "../components/reports/ReservationsByHourChart";

export function ReportsPage() {
  const [range, setRange] = useState<"today" | "week">("today");

  const { data, isLoading, isError } = useQuery<ReportSummary>({
    queryKey: ["reports", "summary", range],
    queryFn: () => api.get("/reports/summary", { params: { range } }).then((res) => res.data),
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Performance at a glance.</p>
        </div>
        <div className="flex rounded-md border border-gray-300 bg-white p-0.5 text-sm">
          {(["today", "week"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1.5 font-medium capitalize ${
                range === r ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {r === "today" ? "Today" : "This week"}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Loading report...</div>}
      {isError && <div className="text-sm text-red-600">Failed to load report data.</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Covers" value={data.totalCovers.toString()} hint={`${data.totalReservations} reservations`} />
            <StatTile label="Avg party size" value={data.avgPartySize.toFixed(1)} />
            <StatTile
              label="Avg turn time"
              value={data.avgTurnMinutes !== null ? `${Math.round(data.avgTurnMinutes)} min` : "—"}
              hint="seated → completed"
            />
            <StatTile label="No-show rate" value={formatPercent(data.noShowRate)} />
            <StatTile label="Cancellation rate" value={formatPercent(data.cancellationRate)} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Reservations by hour</h2>
            <ReservationsByHourChart data={data.reservationsByHour} />
          </div>
        </>
      )}
    </div>
  );
}
