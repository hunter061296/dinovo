-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "autoTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
