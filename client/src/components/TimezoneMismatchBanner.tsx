import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

// Minutes `timeZone` is ahead of UTC right now, via the browser's own tz database.
function offsetMinutes(timeZone: string, at: Date): number {
  const wall = new Date(at.toLocaleString("en-US", { timeZone }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((wall.getTime() - utc.getTime()) / 60_000);
}

// The server files every reservation under the restaurant's calendar day and shift (its
// RESTAURANT_TIMEZONE), while this app shows times in the device's own zone. When those disagree
// — a manager checking the book while traveling, or a tablet set to the wrong zone — times on
// screen would be off by the difference, so say so instead of letting it look correct.
export function TimezoneMismatchBanner() {
  const { data } = useQuery<{ timeZone: string }>({
    queryKey: ["config"],
    queryFn: () => api.get("/config").then((res) => res.data),
    staleTime: Infinity,
  });
  if (!data) return null;

  const now = new Date();
  let restaurantOffset: number;
  try {
    restaurantOffset = offsetMinutes(data.timeZone, now);
  } catch {
    return null;
  }
  if (restaurantOffset === -now.getTimezoneOffset()) return null;

  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div role="alert" className="shrink-0 bg-red-100 px-4 py-1.5 text-center text-sm font-medium text-red-900 dark:bg-red-900/50 dark:text-red-200">
      This device's clock is set to {deviceZone}, but the restaurant runs on {data.timeZone}. Reservation times on this screen
      will be off — set the device to the restaurant's timezone.
    </div>
  );
}
