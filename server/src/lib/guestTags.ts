import { prisma } from "./prisma";

// Auto-tag thresholds — tune here, referenced from NOTES.md.
export const REGULAR_VISIT_THRESHOLD = 5;
export const LAPSING_DAYS_THRESHOLD = 60;
// A guest who's only ever visited once or twice isn't "lapsing," they're just infrequent — the
// Lapsing tag additionally requires they were a Regular at some point, or have visited at least
// this many times.
export const LAPSING_MIN_VISITS = 3;

export const AUTO_TAG_REGULAR = "Regular";
export const AUTO_TAG_LAPSING = "Lapsing";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Recomputes the full set of system-inferred tags for a guest from their current visitCount and
// visit history, and overwrites Guest.autoTags with the result. Kept entirely separate from the
// host-editable `tags` field (see schema comment) so this can safely run after every status
// change without disturbing anything a host set manually.
export async function recomputeAutoTags(guestId: string): Promise<void> {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    include: {
      reservations: { where: { status: "COMPLETED" }, orderBy: { dateTime: "desc" }, take: 1 },
    },
  });
  if (!guest) return;

  const wasRegular = guest.autoTags.includes(AUTO_TAG_REGULAR);
  const isRegular = guest.visitCount >= REGULAR_VISIT_THRESHOLD;

  const lastCompleted = guest.reservations[0];
  const daysSinceLastVisit = lastCompleted ? (Date.now() - lastCompleted.dateTime.getTime()) / MS_PER_DAY : null;
  const isLapsing =
    daysSinceLastVisit !== null &&
    daysSinceLastVisit >= LAPSING_DAYS_THRESHOLD &&
    (isRegular || wasRegular || guest.visitCount >= LAPSING_MIN_VISITS);

  const autoTags: string[] = [];
  if (isRegular) autoTags.push(AUTO_TAG_REGULAR);
  if (isLapsing) autoTags.push(AUTO_TAG_LAPSING);

  await prisma.guest.update({ where: { id: guestId }, data: { autoTags } });
}
