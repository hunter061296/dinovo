import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Shift } from "../../lib/reservations";
import { DAY_NAMES } from "../../lib/pacing";
import { formatTrend, type ShiftOverview } from "../../lib/reports";
import { StatTile } from "./StatTile";
import { PartySizeTrendChart } from "./PartySizeTrendChart";

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

export function ShiftOverviewTab() {
  const [date, setDate] = useState(todayLocalISODate());
  const [shiftId, setShiftId] = useState<string>("");

  const { data: shifts } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: () => api.get("/shifts").then((res) => res.data),
  });

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const shiftsThatDay = useMemo(() => (shifts ?? []).filter((s) => s.dayOfWeek === dayOfWeek), [shifts, dayOfWeek]);

  // Default to (or fall back to) the first shift configured for whichever day is selected —
  // picking a date whose day has no matching shift just clears the dropdown below.
  useEffect(() => {
    if (shiftsThatDay.length === 0) {
      setShiftId("");
    } else if (!shiftsThatDay.some((s) => s.id === shiftId)) {
      setShiftId(shiftsThatDay[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftsThatDay]);

  const { data, isLoading, isError } = useQuery<ShiftOverview>({
    queryKey: ["reports", "shift-overview", shiftId, date],
    queryFn: () => api.get("/reports/shift-overview", { params: { shiftId, date } }).then((res) => res.data),
    enabled: !!shiftId,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Shift</span>
          <select
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            disabled={shiftsThatDay.length === 0}
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {shiftsThatDay.length === 0 && <option>No shifts configured for this day</option>}
            {shiftsThatDay.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shiftsThatDay.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          No shift is configured for {DAY_NAMES[dayOfWeek]}s — set one up under Shifts &amp; Pacing.
        </div>
      )}

      {shiftId && isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading shift overview...</div>}
      {shiftId && isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load this shift's report.</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Total parties"
              value={data.current.totalParties.toString()}
              hint={`Trailing 4-shift avg: ${formatTrend(data.trendAverage.totalParties)}`}
            />
            <StatTile
              label="Total covers"
              value={data.current.totalCovers.toString()}
              hint={`Trailing 4-shift avg: ${formatTrend(data.trendAverage.totalCovers)}`}
            />
            <StatTile
              label="Walk-in covers"
              value={data.current.walkInCovers.toString()}
              hint={`Trailing 4-shift avg: ${formatTrend(data.trendAverage.walkInCovers)}`}
            />
            <StatTile
              label="Short-notice covers"
              value={data.current.shortNoticeCovers.toString()}
              hint={`Booked <3h ahead · avg ${formatTrend(data.trendAverage.shortNoticeCovers)}`}
            />
            <StatTile
              label="Cancelled covers"
              value={data.current.cancelledCovers.toString()}
              hint={`Trailing 4-shift avg: ${formatTrend(data.trendAverage.cancelledCovers)}`}
            />
            <StatTile
              label="No-show covers"
              value={data.current.noShowCovers.toString()}
              hint={`Trailing 4-shift avg: ${formatTrend(data.trendAverage.noShowCovers)}`}
            />
            {/* Dinovo has no POS/payment integration, so these read as "not tracked" rather than
                faking a $0 value — see NOTES.md. */}
            <StatTile label="Avg. per-cover spend" value="—" hint="Requires POS integration" />
            <StatTile label="Total guest spend" value="—" hint="Requires POS integration" />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 p-4">
            <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Party size, last 5 occurrences</h2>
            <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
              {data.shift.name} · every {DAY_NAMES[data.shift.dayOfWeek]}
            </p>
            <PartySizeTrendChart data={data.partiesChart} />
          </div>
        </>
      )}
    </div>
  );
}
