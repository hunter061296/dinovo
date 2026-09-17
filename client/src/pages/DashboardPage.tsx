import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import type { Reservation } from "../lib/reservations";
import { minutesToLabel, STATUS_STYLES, STATUS_LABELS } from "../lib/reservations";
import type { RestaurantTable } from "../lib/tables";
import type { WaitlistEntry } from "../lib/waitlist";
import { CurrentlySeatedPanel } from "../components/floorplan/CurrentlySeatedPanel";

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const today = todayLocalISODate();
  const canSeeReports = user?.role === "ADMIN" || user?.role === "MANAGER";

  const { data: reservations } = useQuery<Reservation[]>({
    queryKey: ["reservations", today],
    queryFn: () => api.get("/reservations", { params: { date: today } }).then((res) => res.data),
  });
  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });
  const { data: waitlist } = useQuery<WaitlistEntry[]>({
    queryKey: ["waitlist", "WAITING"],
    queryFn: () => api.get("/waitlist").then((res) => res.data),
  });
  const { data: reportSummary } = useQuery({
    queryKey: ["reports", "summary", "today"],
    queryFn: () => api.get("/reports/summary", { params: { range: "today" } }).then((res) => res.data),
    enabled: canSeeReports,
  });

  const activeReservations = reservations?.filter((r) => r.status !== "CANCELLED") ?? [];
  const totalCovers = activeReservations.reduce((sum, r) => sum + r.partySize, 0);
  const seatedCount = tables?.filter((t) => t.status === "SEATED").length ?? 0;
  const openCount = tables?.filter((t) => t.status === "OPEN").length ?? 0;
  const waitingCovers = waitlist?.reduce((sum, w) => sum + w.partySize, 0) ?? 0;

  const now = new Date();
  const upcoming = (reservations ?? [])
    .filter((r) => r.status === "BOOKED" && new Date(r.dateTime) >= now)
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Welcome, {user?.name}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} ·{" "}
          <span className="font-medium">{user?.role}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/reservations" className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700">
          New reservation
        </Link>
        <Link
          to="/waitlist"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Add to waitlist
        </Link>
        <Link
          to="/floor-plan"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          View floor plan
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Today's reservations" value={activeReservations.length} sub={`${totalCovers} covers`} />
        <StatTile label="Currently seated" value={seatedCount} sub={tables ? `of ${tables.length} tables` : undefined} />
        <StatTile label="On waitlist" value={waitlist?.length ?? 0} sub={waitingCovers ? `${waitingCovers} covers` : undefined} />
        <StatTile label="Tables open" value={openCount} sub={tables ? `of ${tables.length} tables` : undefined} />
      </div>

      {canSeeReports && reportSummary && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-gray-400 dark:text-gray-500">Covers today: </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{reportSummary.totalCovers}</span>
            </div>
            <div>
              <span className="text-gray-400 dark:text-gray-500">Avg turn time: </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {reportSummary.avgTurnMinutes ? `${Math.round(reportSummary.avgTurnMinutes)} min` : "—"}
              </span>
            </div>
            <div>
              <span className="text-gray-400 dark:text-gray-500">No-show rate: </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(reportSummary.noShowRate * 100)}%</span>
            </div>
          </div>
          <Link to="/reports" className="text-sm font-medium text-accent-600 hover:underline dark:text-accent-400">
            View full reports →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Upcoming reservations</h2>
            <Link to="/reservations" className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">
              View all
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 dark:text-gray-500">Nothing else booked for today.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {r.guest.firstName} {r.guest.lastName} · {r.partySize}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {r.table ? `Table ${r.table.number}` : "Unassigned"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                      {minutesToLabel(new Date(r.dateTime).getHours() * 60 + new Date(r.dateTime).getMinutes())}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <CurrentlySeatedPanel fullWidth />
      </div>
    </div>
  );
}
