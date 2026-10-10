// Dev-only helper: adds BOOKED test reservations across today and the next 6 days (7 days total)
// without wiping anything (unlike seed.ts, which always clears first). Run after the main seed:
//   npm run seed        # base data (users, tables, guests, one day of reservations)
//   npm run seed:week    # + reservations for today through 6 days out
//
// Also backfills Lunch/Dinner shifts (and their pacing rules) for any of those days that doesn't
// have them yet — seedData.ts only creates shifts for the single weekday it happened to run on,
// so most days start with no shift coverage at all.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const mins = (h: number, m = 0) => h * 60 + m;
const LUNCH_TIMES = [mins(11, 30), mins(12), mins(12, 30), mins(13), mins(13, 30)];
const DINNER_TIMES = [mins(17, 30), mins(18), mins(18, 30), mins(19), mins(19, 30), mins(20)];
const LUNCH_SLOTS = [mins(11), mins(11, 30), mins(12), mins(12, 30), mins(13), mins(13, 30), mins(14), mins(14, 30)];
const DINNER_SLOTS = [mins(17), mins(17, 30), mins(18), mins(18, 30), mins(19), mins(19, 30), mins(20), mins(20, 30), mins(21), mins(21, 30)];

const PARTY_SIZES = [2, 2, 4, 4, 6, 2, 8, 3];
const DAYS_AHEAD = 7; // today + the next 6 days

async function ensureShiftsForDay(dayOfWeek: number) {
  const existing = await prisma.shift.findMany({ where: { dayOfWeek } });

  let lunch = existing.find((s) => s.name === "Lunch");
  if (!lunch) {
    lunch = await prisma.shift.create({ data: { name: "Lunch", dayOfWeek, startMinutes: mins(11), endMinutes: mins(15) } });
    await Promise.all(
      LUNCH_SLOTS.map((slot) => prisma.pacingRule.create({ data: { shiftId: lunch!.id, timeSlotMinutes: slot, maxCovers: 24, maxPartySize: 8 } }))
    );
  }

  let dinner = existing.find((s) => s.name === "Dinner");
  if (!dinner) {
    dinner = await prisma.shift.create({ data: { name: "Dinner", dayOfWeek, startMinutes: mins(17), endMinutes: mins(22) } });
    await Promise.all(
      DINNER_SLOTS.map((slot) =>
        prisma.pacingRule.create({
          data: { shiftId: dinner!.id, timeSlotMinutes: slot, maxCovers: slot >= mins(18, 30) && slot <= mins(20, 30) ? 32 : 40, maxPartySize: 10 },
        })
      )
    );
  }

  return { lunch, dinner };
}

async function main() {
  const guests = await prisma.guest.findMany();
  const tables = await prisma.restaurantTable.findMany();
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const host = await prisma.user.findFirst({ where: { role: "HOST" } });

  if (guests.length === 0 || tables.length === 0) {
    console.error("No guests/tables found — run `npm run seed` first.");
    process.exit(1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let guestIdx = 0;
  let tableIdx = 0;
  let count = 0;
  const creates: Promise<unknown>[] = [];

  for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
    const day = new Date(today.getTime() + dayOffset * 86_400_000);
    const { lunch, dinner } = await ensureShiftsForDay(day.getDay());
    const isToday = dayOffset === 0;

    for (const minutesOfDay of [...LUNCH_TIMES, ...DINNER_TIMES]) {
      const dateTime = new Date(day);
      dateTime.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);

      // Skip already-passed slots today — every date in this range is today or later, so there's
      // no "past" day to backfill with a completed/cancelled/no-show mix, only this.
      if (isToday && dateTime.getTime() < Date.now()) {
        count++;
        continue;
      }

      const guest = guests[guestIdx % guests.length];
      guestIdx++;
      const partySize = PARTY_SIZES[count % PARTY_SIZES.length];
      const assignTable = count % 4 !== 0; // leave ~25% unassigned, like the base seed
      const table = assignTable ? tables[tableIdx % tables.length] : null;
      if (assignTable) tableIdx++;
      const shift = minutesOfDay < mins(15) ? lunch : dinner;

      // Most reservations are booked a few days ahead; every 5th is short-notice (<3h before the
      // reservation time) so the Shift Overview report's "short-notice covers" stat has data.
      const createdAt = count % 5 === 0 ? new Date(dateTime.getTime() - 90 * 60_000) : new Date(dateTime.getTime() - 3 * 86_400_000);

      creates.push(
        prisma.reservation.create({
          data: {
            guestId: guest.id,
            partySize,
            dateTime,
            status: "BOOKED",
            tableId: table?.id ?? null,
            shiftId: shift.id,
            generalNote: count % 6 === 0 ? "Test reservation — seeded for QA, safe to delete." : undefined,
            createdById: count % 2 === 0 ? host?.id : admin?.id,
            createdAt,
          },
        })
      );
      count++;
    }
  }

  await Promise.all(creates);
  const lastDay = new Date(today.getTime() + (DAYS_AHEAD - 1) * 86_400_000);
  console.log(`Created ${creates.length} test reservations across ${today.toDateString()} - ${lastDay.toDateString()}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
