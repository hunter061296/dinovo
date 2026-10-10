import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { TurnTimeRule } from "../../lib/tables";

interface Row {
  maxPartySize: string;
  minutes: string;
}

const toRows = (rules: TurnTimeRule[]): Row[] =>
  [...rules].sort((a, b) => a.maxPartySize - b.maxPartySize).map((r) => ({ maxPartySize: String(r.maxPartySize), minutes: String(r.minutes) }));

interface Props {
  // null = the house defaults; otherwise this shift's overrides.
  shiftId: string | null;
  rules: TurnTimeRule[];
  // Shown for a shift with no overrides of its own, and copied in by "Customize".
  fallbackRules?: TurnTimeRule[];
  defaultMinutes: number;
}

// Edits one scope's party-size brackets ("parties up to N take M minutes") and saves the whole set
// at once (PUT /turn-times replaces the scope). Server lookup: server/src/lib/turnTimes.ts.
export function TurnTimeEditor({ shiftId, rules, fallbackRules, defaultMinutes }: Props) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(toRows(rules));
  const [error, setError] = useState<string | null>(null);

  // Keyed on content, not identity: callers pass freshly filtered arrays every render, which
  // would otherwise wipe in-progress edits. Resets only after a save/refetch changes the rules.
  const savedKey = JSON.stringify(toRows(rules));
  useEffect(() => setRows(JSON.parse(savedKey)), [savedKey]);

  const save = useMutation({
    mutationFn: (next: Row[]) =>
      api.put("/turn-times", {
        shiftId,
        rules: next.map((r) => ({ maxPartySize: Number(r.maxPartySize), minutes: Number(r.minutes) })),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["turn-times"] });
      // Every reservation's effective table time can change.
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (err: any) => setError(err.response?.data?.error || "Failed to save turn times"),
  });

  const usingFallback = shiftId !== null && rules.length === 0 && rows.length === 0;
  const dirty = JSON.stringify(rows) !== savedKey;
  const valid = rows.every((r) => Number(r.maxPartySize) > 0 && Number(r.minutes) >= 15);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  if (usingFallback) {
    return (
      <div className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-400">
        Uses the house turn times.
        <button
          onClick={() => setRows(toRows(fallbackRules ?? []).length ? toRows(fallbackRules ?? []) : [{ maxPartySize: "2", minutes: String(defaultMinutes) }])}
          className="text-xs font-medium text-accent-600 hover:underline"
        >
          Customize for this shift
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 px-4 py-3 dark:bg-gray-900/40">
      {error && <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
            <th className="px-2 py-1 font-medium">Parties up to</th>
            <th className="px-2 py-1 font-medium">Table time (min)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="px-2 py-1">
                <input
                  type="number"
                  min={1}
                  aria-label="Parties up to"
                  value={row.maxPartySize}
                  onChange={(e) => update(i, { maxPartySize: e.target.value })}
                  className="w-24 rounded-md border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </td>
              <td className="px-2 py-1">
                <input
                  type="number"
                  min={15}
                  step={5}
                  aria-label="Table time in minutes"
                  value={row.minutes}
                  onChange={(e) => update(i, { minutes: e.target.value })}
                  className="w-24 rounded-md border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </td>
              <td className="px-2 py-1 text-right">
                <button
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
          {shiftId ? "Saving with no brackets returns this shift to the house turn times." : `No brackets — every party gets ${defaultMinutes} minutes.`}
        </p>
      )}
      <p className="px-2 pt-1 text-xs text-gray-500 dark:text-gray-400">Parties bigger than the largest bracket use its time.</p>
      <div className="mt-2 flex justify-between gap-2">
        <button
          onClick={() => {
            const last = rows[rows.length - 1];
            setRows([...rows, { maxPartySize: String((Number(last?.maxPartySize) || 0) + 2), minutes: last?.minutes ?? String(defaultMinutes) }]);
          }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          + Add bracket
        </button>
        <button
          onClick={() => save.mutate(rows)}
          disabled={!dirty || !valid || save.isPending}
          className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {save.isPending ? "Saving..." : "Save turn times"}
        </button>
      </div>
    </div>
  );
}
