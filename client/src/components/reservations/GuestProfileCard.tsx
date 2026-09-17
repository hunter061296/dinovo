import type { Guest } from "../../lib/reservations";

function lastVisitLabel(guest: Guest): string {
  const completed = guest.reservations?.find((r) => r.status === "COMPLETED");
  const mostRecent = completed ?? guest.reservations?.[0];
  if (!mostRecent) return "No previous visits";
  return `Last visit ${new Date(mostRecent.dateTime).toLocaleDateString()}`;
}

export function GuestProfileCard({ guest }: { guest: Guest }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">
          {guest.firstName} {guest.lastName}
        </span>
        <span className="text-xs text-gray-500">
          {guest.visitCount} visit{guest.visitCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-gray-500">{lastVisitLabel(guest)}</div>
      {guest.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {guest.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {tag}
            </span>
          ))}
        </div>
      )}
      {guest.notes && <p className="mt-2 text-xs text-gray-600">{guest.notes}</p>}
    </div>
  );
}
