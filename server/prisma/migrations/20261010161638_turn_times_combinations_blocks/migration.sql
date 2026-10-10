-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "combinationId" TEXT,
ADD COLUMN     "durationMinutes" INTEGER;

-- CreateTable
CREATE TABLE "turn_times" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT,
    "maxPartySize" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turn_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_combinations" (
    "id" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_combinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_blocks" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CombinationTables" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "turn_times_shiftId_maxPartySize_key" ON "turn_times"("shiftId", "maxPartySize");

-- CreateIndex
CREATE INDEX "table_blocks_tableId_startsAt_idx" ON "table_blocks"("tableId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "_CombinationTables_AB_unique" ON "_CombinationTables"("A", "B");

-- CreateIndex
CREATE INDEX "_CombinationTables_B_index" ON "_CombinationTables"("B");

-- CreateIndex
CREATE INDEX "reservations_combinationId_idx" ON "reservations"("combinationId");

-- AddForeignKey
ALTER TABLE "turn_times" ADD CONSTRAINT "turn_times_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_blocks" ADD CONSTRAINT "table_blocks_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_blocks" ADD CONSTRAINT "table_blocks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "table_combinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CombinationTables" ADD CONSTRAINT "_CombinationTables_A_fkey" FOREIGN KEY ("A") REFERENCES "restaurant_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CombinationTables" ADD CONSTRAINT "_CombinationTables_B_fkey" FOREIGN KEY ("B") REFERENCES "table_combinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
