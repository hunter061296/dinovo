import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Shift } from "../../lib/reservations";
import { minutesToLabel } from "../../lib/reservations";

function PacingRow({ shift, slot }: { shift: Shift; slot: number }) {
  const queryClient = useQueryClient();
  const existing = shift.pacingRules.find((r) => r.timeSlotMinutes === slot);
  const [maxCovers, setMaxCovers] = useState(existing?.maxCovers?.toString() ?? "");
  const [maxPartySize, setMaxPartySize] = useState(existing?.maxPartySize?.toString() ?? "");

  useEffect(() => {
    setMaxCovers(existing?.maxCovers?.toString() ?? "");
    setMaxPartySize(existing?.maxPartySize?.toString() ?? "");
  }, [existing?.maxCovers, existing?.maxPartySize]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/shifts/${shift.id}/pacing-rules/${slot}`, {
        maxCovers: Number(maxCovers),
        maxPartySize: Number(maxPartySize),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const clear = useMutation({
    mutationFn: () => api.delete(`/shifts/${shift.id}/pacing-rules/${slot}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const dirty = maxCovers !== (existing?.maxCovers?.toString() ?? "") || maxPartySize !== (existing?.maxPartySize?.toString() ?? "");
  const canSave = maxCovers !== "" && maxPartySize !== "" && Number(maxCovers) > 0 && Number(maxPartySize) > 0;

  return (
    <tr className="border-t border-gray-100">
      <td className="px-3 py-1.5 text-sm text-gray-600">{minutesToLabel(slot)}</td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          min={1}
          placeholder="No cap"
          value={maxCovers}
          onChange={(e) => setMaxCovers(e.target.value)}
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          min={1}
          placeholder="No limit"
          value={maxPartySize}
          onChange={(e) => setMaxPartySize(e.target.value)}
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <div className="flex justify-end gap-2">
          {dirty && canSave && (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-60"
            >
              Save
            </button>
          )}
          {existing && (
            <button onClick={() => clear.mutate()} disabled={clear.isPending} className="text-xs font-medium text-gray-400 hover:text-red-600">
              Clear
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function PacingEditor({ shift }: { shift: Shift }) {
  const slots: number[] = [];
  for (let m = shift.startMinutes; m < shift.endMinutes; m += 30) slots.push(m);

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
      <p className="mb-2 text-xs text-gray-500">
        Set a covers cap and/or party-size limit per 30-min slot. Leave blank for no cap. The Reservation Book warns
        (but never blocks) when a booking would exceed these.
      </p>
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="px-3 py-1 font-medium">Slot</th>
            <th className="px-3 py-1 font-medium">Max covers</th>
            <th className="px-3 py-1 font-medium">Max party size</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <PacingRow key={slot} shift={shift} slot={slot} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
