# Notes: stubs, out-of-scope pieces, and corners cut for MVP speed

This is an MVP built to validate the host-stand workflow end to end. This
document is the honest accounting of what's real, what's faked, and what I'd
do differently before this goes near production.

## Stubbed

### Guest notifications ("table is ready", waitlist)

`POST /api/tables/:id/notify` (used by the Floor Plan's "Notify guest table is
ready" action) always returns `{ success: true, message: "(stub) ..." }` — no
SMS or email is actually sent. The UI shows a real confirmation message so the
host workflow feels complete, but nothing leaves the server.

**To make it real**: pick a provider — Twilio for SMS (guests already have a
`phone` on `Guest`/`WaitlistEntry`) or SendGrid/Postmark for email. Add a
`notifications` service with a single `sendGuestNotification(guest, message)`
function, call it from the existing endpoint, and store a delivery log
(a `Notification` table: guestId, channel, status, sentAt) so hosts can see
whether a message actually went out rather than just trusting a button click.

## Out of scope (and how I'd add them)

- **Public booking widget.** This app is host-facing only. A public booking
  flow would be a separate, unauthenticated surface (a small public app or a
  handful of public routes) that creates `Reservation` + `Guest` records
  through the existing API, reusing the Phase 8 pacing logic (`lib/pacing.ts`
  on the client, `lib/reportMetrics.ts`/pacing rules on the server) so the
  public flow can't overbook a slot the host stand itself would warn about.
  Guests would need some lightweight identity (magic link or phone+OTP) to
  manage/cancel their own booking.

- **POS integration for auto table-statusing.** Table status (Open / Seated /
  Ordered / Needs Cleaning) is entirely host-driven right now — nobody's
  status click is verified against reality. A POS integration would listen
  for check-open/check-closed webhooks and drive `PATCH /api/tables/:id/status`
  automatically, and could also set `Reservation.seatedAt`/`completedAt`
  directly instead of relying on a host remembering to update status, which
  would make the Phase 9 turn-time metric (see below) actually accurate
  instead of a proxy.

- **Payments.** Not needed for a host-stand tool — no ordering or billing
  happens here. If this ever meets a POS/ordering system, this app would be a
  consumer of "check closed" events, not a payments participant.

- **Multi-location.** The schema has no `Restaurant` model — everything
  (tables, guests, shifts, reservations, waitlist) is implicitly scoped to one
  location. To support multiple locations: add a `Restaurant` model, add
  `restaurantId` to every other model, replace today's global-uniqueness
  constraints (e.g. table `number` is globally unique — it'd need to become
  unique per restaurant), and scope every query in every route by the
  logged-in user's restaurant (or a restaurant switcher for multi-location
  Admins).

## Corners cut for MVP speed, phase by phase

- **Auth (Phase 2)**: JWTs aren't revocable before expiry. Deactivating a user
  blocks new logins and `/auth/me`, but a token already issued stays valid for
  up to its 12h expiry. Fine for a single trusted location; would want a
  shorter expiry or a server-side revocation list before this leaves one
  restaurant's control.
- **Floor plan (Phase 3)**: no collision detection when dragging — tables can
  be dropped on top of each other. The canvas scales to fit a tablet screen
  but doesn't pan/zoom, so a much larger floor plan (50+ tables) would get
  cramped.
- **Reservation book (Phase 4)**: table assignment is a plain dropdown, not
  drag-and-drop onto the floor plan (that interaction lives on the Floor Plan
  page instead, for table *status*). Assigning the same table to two
  overlapping reservations is server-enforced (409, see Pacing note below) —
  not just a client warning.
- **Live status (Phase 5)**: fully manual — see the POS note above. No
  visible "reconnecting..." indicator if the Socket.io connection drops
  (it reconnects automatically, but silently).
- **Waitlist (Phase 6)**: the quoted-wait estimate uses a fixed 45-minute
  average turn time rather than one computed from real history — Phase 9
  already calculates real average turn time, so feeding that back into the
  estimate is the natural next step.
- **Guestbook (Phase 7)**: no merge/dedup tooling if the same person ends up
  with two profiles (e.g. booked once by phone, once by email with a typo).
  No guest deletion. The "browse all" list is capped at 100 with no
  pagination.
- **Pacing (Phase 8)**: slots are fixed at 30 minutes (no 15-minute option),
  and there's no bulk-fill — each slot's cap is set individually, which is
  tedious for configuring a whole shift from scratch. The `maxCovers`/
  `maxPartySize` cap check is enforced server-side (`server/src/lib/
  pacing.ts`, called from `POST`/`PATCH /api/reservations`), not just in the
  client — it stays a soft warning (`overCap`/`capDetail` on the response),
  matching the client's existing amber-warning UX, since pacing is guidance
  a host can knowingly override, not a physical constraint. Double-booking a
  table is a physical constraint instead, so that check (`server/src/lib/
  tableAvailability.ts`) is a hard 409 block; it uses a flat 90-minute
  occupancy window around a reservation's `dateTime` rather than a real
  per-table turn-time setting, since none exists yet (`Reservation.
  seatedAt`/`completedAt` could inform a real one — see the turn-time note
  under Reports below).
- **Reports (Phase 9)**: average turn time is computed from a
  reservation's own `seatedAt`/`completedAt` timestamps, since there's no
  full table-status audit log to derive it from directly — accurate only as
  long as hosts promptly update status. Only Today/This week ranges, no
  custom date range, no export.
- **General**: single-location only (see Multi-location above); no automated
  test suite — everything in this build was verified with manual scripted
  browser passes (Playwright) during development rather than a committed
  test suite, which would be the first thing to add before a second
  developer touches this codebase.
