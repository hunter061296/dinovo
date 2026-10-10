import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { RestaurantTable, TableCombination } from "../../lib/tables";
import { combinationLabel } from "../../lib/tables";

interface Props {
  value: string;
  onChange: (value: string) => void;
  // When set, options too small for the party are labeled so the host notices.
  partySize?: number;
  className?: string;
}

export function TableAssignSelect({ value, onChange, partySize, className }: Props) {
  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });
  const { data: combinations } = useQuery<TableCombination[]>({
    queryKey: ["table-combinations"],
    queryFn: () => api.get("/table-combinations").then((res) => res.data),
  });

  const tooSmall = (capacity: number) => (partySize && capacity < partySize ? " — too small" : "");

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"}
    >
      <option value="">Unassigned</option>
      <optgroup label="Tables">
        {tables?.map((t) => (
          <option key={t.id} value={`t:${t.id}`}>
            Table {t.number} ({t.capacity} seats){tooSmall(t.capacity)}
          </option>
        ))}
      </optgroup>
      {combinations && combinations.length > 0 && (
        <optgroup label="Combined tables">
          {combinations.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              Tables {combinationLabel(c)} ({c.capacity} seats){tooSmall(c.capacity)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
