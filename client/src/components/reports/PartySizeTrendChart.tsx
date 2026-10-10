interface Props {
  data: { date: string; largePartyCount: number; regularPartyCount: number }[];
}

const TRACK_HEIGHT_PX = 160;

function formatShortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Stacked bar per occurrence: Regular parties (partySize < 6) below, Large parties (>= 6) above —
// see LARGE_PARTY_THRESHOLD in server/src/lib/reportMetrics.ts.
export function PartySizeTrendChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-gray-400 dark:text-gray-500">No data for this shift yet.</div>;
  }

  const maxCount = Math.max(1, ...data.map((d) => d.largePartyCount + d.regularPartyCount));

  return (
    <div>
      <div className="flex items-end gap-3 px-2">
        {data.map((d, i) => {
          const total = d.largePartyCount + d.regularPartyCount;
          const isLatest = i === data.length - 1;
          return (
            <div key={d.date} className="group relative flex flex-1 flex-col items-center gap-1">
              <div className="pointer-events-none absolute -top-6 rounded bg-gray-900 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                {total} {total === 1 ? "party" : "parties"}
              </div>
              <div className="flex w-full flex-col-reverse" style={{ height: TRACK_HEIGHT_PX }}>
                <div
                  className={`w-full ${d.largePartyCount === 0 ? "rounded-t" : ""} bg-accent-300 transition-colors group-hover:bg-accent-400 dark:bg-accent-800`}
                  style={{ height: total ? `${(d.regularPartyCount / maxCount) * 100}%` : 0 }}
                />
                <div
                  className="w-full rounded-t bg-accent-600 transition-colors group-hover:bg-accent-700"
                  style={{ height: total ? `${(d.largePartyCount / maxCount) * 100}%` : 0 }}
                />
              </div>
              <span className={`text-[10px] ${isLatest ? "font-semibold text-gray-700 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"}`}>
                {isLatest ? "Today" : formatShortDate(d.date)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent-600" /> Large party (6+)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent-300 dark:bg-accent-800" /> Regular party
        </span>
      </div>
    </div>
  );
}
