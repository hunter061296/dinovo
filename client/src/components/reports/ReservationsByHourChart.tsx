import { formatHour } from "../../lib/reports";

interface Props {
  data: { hour: number; count: number }[];
}

const TRACK_HEIGHT_PX = 160;

export function ReservationsByHourChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-gray-400 dark:text-gray-500">No reservations in this range.</div>;
  }

  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div className="flex items-end gap-2 px-2">
      {data.map((d) => (
        <div key={d.hour} className="group relative flex flex-1 flex-col items-center gap-1">
          <div className="pointer-events-none absolute -top-6 rounded bg-gray-900 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            {d.count}
          </div>
          {/* A fixed-height track so the bar's percentage height has a definite ancestor to resolve against. */}
          <div className="flex w-full items-end" style={{ height: TRACK_HEIGHT_PX }}>
            <div
              className="w-full rounded-t bg-accent-500 transition-colors group-hover:bg-accent-600"
              style={{ height: `${Math.max((d.count / maxCount) * 100, 4)}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatHour(d.hour)}</span>
        </div>
      ))}
    </div>
  );
}
