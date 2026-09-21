import { formatOccasionDate, type Guest } from "../../lib/reservations";
import { TagBadge } from "../TagBadge";

function lastVisitLabel(guest: Guest): string {
  const completed = guest.reservations?.find((r) => r.status === "COMPLETED");
  const mostRecent = completed ?? guest.reservations?.[0];
  if (!mostRecent) return "No previous visits";
  return `Last visit ${new Date(mostRecent.dateTime).toLocaleDateString()}`;
}

export function GuestProfileCard({ guest }: { guest: Guest }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-600 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {guest.firstName} {guest.lastName}
        </span>
        <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {guest.visitCount} visit{guest.visitCount === 1 ? "" : "s"}
          {guest.noShowCount > 0 && (
            <span className={guest.noShowCount >= 2 ? "font-semibold text-red-600 dark:text-red-400" : ""}>
              · {guest.noShowCount} no-show{guest.noShowCount === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{lastVisitLabel(guest)}</div>
      {guest.specialOccasion && guest.specialOccasionDate && (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          🎉 {guest.specialOccasion} — {formatOccasionDate(guest.specialOccasionDate)}
        </div>
      )}
      {(guest.tags.length > 0 || guest.autoTags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {guest.tags.map((tag) => (
            <TagBadge key={`manual-${tag}`} tag={tag} />
          ))}
          {guest.autoTags.map((tag) => (
            <TagBadge key={`auto-${tag}`} tag={tag} auto />
          ))}
        </div>
      )}
      {guest.notes && <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{guest.notes}</p>}
    </div>
  );
}
