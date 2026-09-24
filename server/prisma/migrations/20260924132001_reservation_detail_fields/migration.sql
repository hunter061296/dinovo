-- AlterTable: Guest — cancellation tracking, mirrors noShowCount
ALTER TABLE "guests" ADD COLUMN     "cancellationCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Reservation — per-visit tags, structured notes, pacing exclusion
ALTER TABLE "reservations" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "reservations" ADD COLUMN     "generalNote" TEXT;
ALTER TABLE "reservations" ADD COLUMN     "offerNote" TEXT;
ALTER TABLE "reservations" ADD COLUMN     "foodDrinkNote" TEXT;
ALTER TABLE "reservations" ADD COLUMN     "seatingNote" TEXT;
ALTER TABLE "reservations" ADD COLUMN     "excludeFromPacing" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: carry existing free-text notes into the new generalNote field so nothing is lost.
UPDATE "reservations" SET "generalNote" = "notes" WHERE "notes" IS NOT NULL;

-- Drop the old single-field notes column now that its data lives in generalNote.
ALTER TABLE "reservations" DROP COLUMN "notes";
