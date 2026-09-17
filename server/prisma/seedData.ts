import { PrismaClient, TableShape, ReservationStatus } from "@prisma/client";
import bcrypt from "bcrypt";

// Minutes-from-midnight helpers keep the pacing/shift math in Phase 8 simple integer arithmetic.
const mins = (h: number, m = 0) => h * 60 + m;

// Shared by prisma/seed.ts (local dev — always wipes and reseeds) and
// prisma/seedIfEmpty.ts (production deploy — only runs against an empty database).
export async function seedDatabase(prisma: PrismaClient) {
  console.log("Clearing existing data...");
  await prisma.reservation.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.pacingRule.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.restaurantTable.deleteMany();
  await prisma.section.deleteMany();
  await prisma.user.deleteMany();

  // ---------- Users ----------
  console.log("Seeding users...");
  const passwordHash = await bcrypt.hash("password123", 10);
  const admin = await prisma.user.create({
    data: { email: "admin@dinovo.test", passwordHash, name: "Alex Admin", role: "ADMIN" },
  });
  await prisma.user.create({
    data: { email: "manager@dinovo.test", passwordHash, name: "Morgan Manager", role: "MANAGER" },
  });
  const host = await prisma.user.create({
    data: { email: "host@dinovo.test", passwordHash, name: "Harper Host", role: "HOST" },
  });

  // ---------- Floor plan sections ----------
  console.log("Seeding sections...");
  const [barSection, mainSection, patioSection] = await Promise.all([
    prisma.section.create({ data: { name: "Bar", position: 0 } }),
    prisma.section.create({ data: { name: "Main Dining", position: 1 } }),
    prisma.section.create({ data: { name: "Patio", position: 2 } }),
  ]);

  // ---------- Floor plan (14 tables, varied sizes/shapes, laid out on a grid) ----------
  console.log("Seeding floor plan...");
  const tableDefs: { number: number; capacity: number; shape: TableShape; x: number; y: number; section: string }[] = [
    { number: 1, capacity: 2, shape: "ROUND", x: 60, y: 60, section: barSection.id },
    { number: 2, capacity: 2, shape: "ROUND", x: 180, y: 60, section: barSection.id },
    { number: 3, capacity: 2, shape: "SQUARE", x: 300, y: 60, section: barSection.id },
    { number: 4, capacity: 4, shape: "SQUARE", x: 60, y: 180, section: mainSection.id },
    { number: 5, capacity: 4, shape: "SQUARE", x: 180, y: 180, section: mainSection.id },
    { number: 6, capacity: 4, shape: "ROUND", x: 300, y: 180, section: mainSection.id },
    { number: 7, capacity: 4, shape: "ROUND", x: 420, y: 180, section: mainSection.id },
    { number: 8, capacity: 6, shape: "RECTANGLE", x: 60, y: 320, section: patioSection.id },
    { number: 9, capacity: 6, shape: "RECTANGLE", x: 220, y: 320, section: patioSection.id },
    { number: 10, capacity: 8, shape: "RECTANGLE", x: 420, y: 320, section: patioSection.id },
    { number: 11, capacity: 2, shape: "SQUARE", x: 420, y: 60, section: barSection.id },
    { number: 12, capacity: 4, shape: "SQUARE", x: 540, y: 180, section: mainSection.id },
    { number: 13, capacity: 2, shape: "ROUND", x: 540, y: 60, section: barSection.id },
    { number: 14, capacity: 10, shape: "RECTANGLE", x: 620, y: 320, section: patioSection.id },
  ];
  const tables = await Promise.all(
    tableDefs.map((t) =>
      prisma.restaurantTable.create({
        data: {
          number: t.number,
          capacity: t.capacity,
          shape: t.shape,
          positionX: t.x,
          positionY: t.y,
          sectionId: t.section,
        },
      })
    )
  );

  // ---------- Guests (18 profiles, varied visit history/tags) ----------
  console.log("Seeding guests...");
  const guestDefs = [
    { firstName: "Emma", lastName: "Johnson", phone: "555-0101", email: "emma.johnson@example.com", visitCount: 12, tags: ["VIP", "Regular"] },
    { firstName: "Liam", lastName: "Smith", phone: "555-0102", email: "liam.smith@example.com", visitCount: 3, tags: ["Regular"] },
    { firstName: "Olivia", lastName: "Williams", phone: "555-0103", email: "olivia.w@example.com", visitCount: 0, tags: [] },
    { firstName: "Noah", lastName: "Brown", phone: "555-0104", email: "noah.brown@example.com", visitCount: 7, tags: ["Allergy"], notes: "Severe peanut allergy — always confirm with kitchen." },
    { firstName: "Ava", lastName: "Jones", phone: "555-0105", email: "ava.jones@example.com", visitCount: 25, tags: ["VIP"] },
    { firstName: "Elijah", lastName: "Garcia", phone: "555-0106", email: "elijah.g@example.com", visitCount: 1, tags: [] },
    { firstName: "Sophia", lastName: "Miller", phone: "555-0107", email: "sophia.miller@example.com", visitCount: 4, tags: ["Regular"] },
    { firstName: "Mason", lastName: "Davis", phone: "555-0108", email: "mason.davis@example.com", visitCount: 0, tags: [] },
    { firstName: "Isabella", lastName: "Rodriguez", phone: "555-0109", email: "isabella.r@example.com", visitCount: 9, tags: ["Regular", "Large Party"] },
    { firstName: "James", lastName: "Martinez", phone: "555-0110", email: "james.martinez@example.com", visitCount: 2, tags: [] },
    { firstName: "Mia", lastName: "Hernandez", phone: "555-0111", email: "mia.h@example.com", visitCount: 15, tags: ["VIP", "Regular"] },
    { firstName: "Benjamin", lastName: "Lopez", phone: "555-0112", email: "ben.lopez@example.com", visitCount: 5, tags: [] },
    { firstName: "Charlotte", lastName: "Gonzalez", phone: "555-0113", email: "charlotte.g@example.com", visitCount: 0, tags: [] },
    { firstName: "Lucas", lastName: "Wilson", phone: "555-0114", email: "lucas.wilson@example.com", visitCount: 6, tags: ["Allergy"], notes: "Gluten intolerant." },
    { firstName: "Amelia", lastName: "Anderson", phone: "555-0115", email: "amelia.a@example.com", visitCount: 18, tags: ["VIP", "Regular"] },
    { firstName: "Henry", lastName: "Thomas", phone: "555-0116", email: "henry.thomas@example.com", visitCount: 1, tags: [] },
    { firstName: "Evelyn", lastName: "Taylor", phone: "555-0117", email: "evelyn.taylor@example.com", visitCount: 3, tags: ["Large Party"] },
    { firstName: "Alexander", lastName: "Moore", phone: "555-0118", email: "alex.moore@example.com", visitCount: 0, tags: [] },
  ];
  const guests = await Promise.all(guestDefs.map((g) => prisma.guest.create({ data: g })));

  // ---------- Shifts ----------
  console.log("Seeding shifts...");
  const lunch = await prisma.shift.create({
    data: { name: "Lunch", dayOfWeek: new Date().getDay(), startMinutes: mins(11), endMinutes: mins(15) },
  });
  const dinner = await prisma.shift.create({
    data: { name: "Dinner", dayOfWeek: new Date().getDay(), startMinutes: mins(17), endMinutes: mins(22) },
  });

  // ---------- Pacing rules (30-min slots, sensible cover/party caps) ----------
  console.log("Seeding pacing rules...");
  const lunchSlots = [mins(11), mins(11, 30), mins(12), mins(12, 30), mins(13), mins(13, 30), mins(14), mins(14, 30)];
  const dinnerSlots = [mins(17), mins(17, 30), mins(18), mins(18, 30), mins(19), mins(19, 30), mins(20), mins(20, 30), mins(21), mins(21, 30)];
  await Promise.all([
    ...lunchSlots.map((slot) =>
      prisma.pacingRule.create({ data: { shiftId: lunch.id, timeSlotMinutes: slot, maxCovers: 24, maxPartySize: 8 } })
    ),
    ...dinnerSlots.map((slot) =>
      prisma.pacingRule.create({
        // Peak dinner slots (6:30-8:30pm) get a tighter cap to model a busy Friday night.
        data: {
          shiftId: dinner.id,
          timeSlotMinutes: slot,
          maxCovers: slot >= mins(18, 30) && slot <= mins(20, 30) ? 32 : 40,
          maxPartySize: 10,
        },
      })
    ),
  ]);

  // ---------- Reservations (a day's worth across lunch + dinner) ----------
  console.log("Seeding reservations...");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const at = (h: number, m = 0) => new Date(today.getTime() + (h * 60 + m) * 60_000);

  const statusCycle: ReservationStatus[] = ["BOOKED", "SEATED", "COMPLETED", "BOOKED", "CANCELLED", "NO_SHOW", "BOOKED", "COMPLETED"];

  const reservationDefs = [
    { guest: guests[0], party: 2, time: at(11, 30), table: tables[0], shift: lunch },
    { guest: guests[1], party: 4, time: at(12, 0), table: tables[3], shift: lunch },
    { guest: guests[2], party: 2, time: at(12, 30), table: tables[1], shift: lunch },
    { guest: guests[3], party: 6, time: at(12, 30), table: tables[7], shift: lunch, notes: "Peanut allergy — confirm with kitchen." },
    { guest: guests[4], party: 4, time: at(13, 0), table: tables[4], shift: lunch },
    { guest: guests[5], party: 2, time: at(13, 30), table: tables[2], shift: lunch },
    { guest: guests[6], party: 8, time: at(13, 30), table: tables[9], shift: lunch },
    { guest: guests[7], party: 2, time: at(14, 0), table: null, shift: lunch },
    { guest: guests[8], party: 6, time: at(17, 30), table: tables[8], shift: dinner },
    { guest: guests[9], party: 2, time: at(18, 0), table: tables[10], shift: dinner },
    { guest: guests[10], party: 4, time: at(18, 0), table: tables[5], shift: dinner },
    { guest: guests[11], party: 4, time: at(18, 30), table: tables[6], shift: dinner },
    { guest: guests[12], party: 2, time: at(19, 0), table: tables[12], shift: dinner },
    { guest: guests[13], party: 4, time: at(19, 0), table: tables[11], shift: dinner, notes: "Gluten intolerant." },
    { guest: guests[14], party: 10, time: at(19, 30), table: tables[13], shift: dinner },
    { guest: guests[15], party: 2, time: at(20, 0), table: null, shift: dinner },
    { guest: guests[16], party: 6, time: at(20, 30), table: null, shift: dinner },
    { guest: guests[17], party: 4, time: at(21, 0), table: null, shift: dinner },
  ];

  await Promise.all(
    reservationDefs.map((r, i) => {
      const status = statusCycle[i % statusCycle.length];
      // Seated/completed reservations get plausible seatedAt/completedAt timestamps so the
      // Phase 9 average-turn-time report has real data to show, not just a null placeholder.
      const seatedAt = status === "SEATED" || status === "COMPLETED" ? new Date(r.time.getTime() + 5 * 60_000) : null;
      const turnMinutes = 40 + r.party * 3;
      const completedAt = status === "COMPLETED" && seatedAt ? new Date(seatedAt.getTime() + turnMinutes * 60_000) : null;

      return prisma.reservation.create({
        data: {
          guestId: r.guest.id,
          partySize: r.party,
          dateTime: r.time,
          status,
          tableId: r.table?.id ?? null,
          shiftId: r.shift.id,
          notes: r.notes,
          createdById: i % 2 === 0 ? host.id : admin.id,
          seatedAt,
          completedAt,
        },
      });
    })
  );

  // ---------- Waitlist (a couple of active walk-ins) ----------
  console.log("Seeding waitlist...");
  await prisma.waitlistEntry.createMany({
    data: [
      { guestName: "Walk-in: Chris P.", phone: "555-0201", partySize: 2, quotedWaitMinutes: 15, status: "WAITING" },
      { guestName: "Walk-in: Dana T.", phone: "555-0202", partySize: 4, quotedWaitMinutes: 30, status: "WAITING" },
    ],
  });

  console.log("Seed complete.");
}
