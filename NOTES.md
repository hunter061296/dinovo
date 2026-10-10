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

The Reservation detail panel's "Message guest" button (`POST
/api/guests/:id/notify`) is the same stub, one level up — it always returns
`{ success: true, message: "(stub) ..." }` with no SMS/email sent. Making it
real is the same fix as above; both endpoints would call the same
`sendGuestNotification` once it exists.

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
  blocks new logins, `/auth/me`, and new live-update (Socket.io) connections,
  but a token already issued stays valid for the rest of the API for up to its
  12h expiry, and a socket that's already connected stays connected (the token
  is checked once, at handshake). Fine for a single trusted location; would
  want a shorter expiry or a server-side revocation list before this leaves
  one restaurant's control.
- **Floor plan (Phase 3)**: no collision detection when dragging — tables can
  be dropped on top of each other. The canvas scales to fit a tablet screen
  but doesn't pan/zoom, so a much larger floor plan (50+ tables) would get
  cramped. The page's date switcher only scopes the Upcoming reservations
  list and each table's "who's next" badge — table status colors, the Seated
  tab, and the Waitlist tab always reflect right now regardless of the
  browsed date, since there's no historical snapshot of live floor state to
  look back at (nor a POS to have generated one). "Pre-Assign" (the sidebar's
  per-row table-assign icon, separate from clicking a guest's name to open
  their reservation) offers every table big enough for the party regardless
  of its current live status, since it's for a future time — the server's
  existing double-booking check (`tableAvailability.ts`) is what actually
  guards against a genuine conflict, not anything client-side.
- **Reservation book (Phase 4)**: table assignment is a dropdown in the
  reservation forms, or drag-and-drop on the Grid view (tables down the side,
  time across the top). Assigning the same table to two overlapping
  reservations is server-enforced (409, see the turn-time note below) — not
  just a client warning. The List view widens its slots to fit any
  reservation booked outside shift hours, so nothing silently drops off it.
- **Live status (Phase 5)**: fully manual — see the POS note above. A banner
  shows while the Socket.io connection is down; it reconnects automatically.
- **Waitlist (Phase 6)**: the quoted wait (`server/src/lib/waitEstimate.ts`)
  simulates the queue from configured turn times: each suitable table frees up
  after its turn time minus how long it's been occupied (plus 5 minutes to
  reset), and parties already waiting claim tables first. Approximations: an
  occupied table's party size isn't tracked, so its capacity stands in for it;
  marking a table Ordered resets its `statusUpdatedAt`, so a table that has
  ordered looks more recently seated than it is; and an open table with a
  reservation arriving soon still counts as free. Turn times are configured,
  not learned — Phase 9's measured average turn time could seed them.
- **Guestbook (Phase 7)**: no merge/dedup tooling if the same person ends up
  with two profiles (e.g. booked once by phone, once by email with a typo).
  No guest deletion. The "browse all" list is capped at 100 with no
  pagination. Auto-tags (`Guest.autoTags`, recomputed in `server/src/lib/
  guestTags.ts` after a reservation's status changes to COMPLETED/NO_SHOW)
  use fixed thresholds, easy to tune in one place: **5** completed visits for
  "Regular", **60** days since the last completed visit (and previously
  Regular or 3+ visits) for "Lapsing", **2** no-shows for "Frequent no-show".
- **Pacing (Phase 8)**: slots are fixed at 30 minutes (no 15-minute option),
  and there's no bulk-fill — each slot's cap is set individually, which is
  tedious for configuring a whole shift from scratch. The `maxCovers`/
  `maxPartySize` cap check is enforced server-side (`server/src/lib/
  pacing.ts`, called from `POST`/`PATCH /api/reservations`), not just in the
  client — it stays a soft warning (`overCap`/`capDetail` on the response),
  matching the client's existing amber-warning UX, since pacing is guidance
  a host can knowingly override, not a physical constraint. Pacing lookups on
  the client are always scoped to the browsed date's weekday (a shift only
  applies on its own `dayOfWeek`).
- **Turn times and table conflicts**: double-booking a table is a physical
  constraint, so that check (`server/src/lib/tableAvailability.ts`) is a hard
  409 block. Each reservation holds its table(s) for its own duration: a host
  override (`Reservation.durationMinutes`, e.g. resized on the Grid view) or
  the `TurnTime` bracket for its party size — a shift's own brackets if it has
  any, else the house defaults, else a flat 90 minutes
  (`server/src/lib/turnTimes.ts`). Brackets are by party size only, not by
  table or section. The check only re-runs when the table, time, party size
  or duration actually changes, so editing a note on a reservation that
  overlaps pre-existing data never gets blocked.
- **Table combinations**: predefined only (Floor Plan settings → Combined
  tables) — a host can't push two arbitrary tables together on the fly. A
  reservation on a combination stores the combination's lowest-numbered table
  as its `tableId`, so everything that shows "Table N" keeps working; deleting
  a combination leaves its reservations on that first table. Moving a party
  that's already seated to a different table doesn't move the table statuses
  with it — the host re-statuses the tables on the Floor Plan.
- **Table blocks**: hold a table out of service for a time range (Grid view →
  Block a table, or tap an empty spot on a table's row). Blocks are checked by
  the conflict check and by waitlist seat-now, and can't be created on top of
  an existing booking, but they don't appear on the live Floor Plan, and on
  the grid they're edited through a form rather than dragged.
- **Grid view**: cancelled and no-show parties are hidden; completed parties
  are shown but read-only; a seated party can be given more or less table time
  but not moved to a new time. Walk-ins seated from the waitlist aren't
  reservations, so they don't appear on the grid. Times on the grid (like
  everywhere in the client) are in the device's timezone — see Timezones.
- **Timezones**: the server computes every calendar day, shift match, pacing
  slot and report range in `RESTAURANT_TIMEZONE` (`server/src/lib/time.ts`).
  The client still does its own date math in the device's timezone rather
  than the restaurant's, so a device set to a different zone shows shifted
  times — it gets a red warning banner instead (`TimezoneMismatchBanner`).
  Making the client fully zone-aware would mean routing every `new Date()` /
  `getHours()` in `client/src` through the restaurant's zone.
- **Reports (Phase 9)**: average turn time is computed from a
  reservation's own `seatedAt`/`completedAt` timestamps, since there's no
  full table-status audit log to derive it from directly — accurate only as
  long as hosts promptly update status. Only Today/This week ranges, no
  custom date range, no export.
- **Printable reservations list**: no "Payment status" column, unlike OpenTable's — Dinovo has
  no POS/payment integration, so there's nothing real to put there (flagged on the print page
  itself, not just here). CSV export and the print view share the same row-building logic
  (`client/src/lib/reservationsPrint.ts`) so they can't drift apart. The "Notes and tags" column
  shows the first non-empty of the four Phase-2 note fields, truncated to 60 characters — not all
  four, to keep the printed row to one line.
- **Shift Overview report**: "Avg. per-cover spend" and "Total guest spend"
  show as "— (requires POS integration)" rather than $0 — Dinovo has no
  POS/payment integration, so there's no guest-spend data to report, faked
  or otherwise. The trend comparison averages the same metric across the
  trailing 4 occurrences of that shift (`TREND_LOOKBACK_OCCURRENCES` in
  `server/src/lib/reportMetrics.ts`); "Large party" is `partySize >= 6`
  (`LARGE_PARTY_THRESHOLD`); "short-notice" is booked within 3 hours of the
  reservation time (`SHORT_NOTICE_WINDOW_MS`) — all three are tunable
  assumptions, not derived from a product spec.
- **General**: single-location only (see Multi-location above). The server
  has an automated suite (`server/test/`, run with `npm test` against a
  dedicated `dinovo_test` database): unit tests for the date, turn-time,
  wait-quote and status-transition logic, and API tests for error handling,
  timezone-correct day/shift/pacing matching, table conflicts, combinations,
  blocks, status transitions, waitlist seating, and socket auth. There's no
  CI wiring yet, and the client has no automated tests — its UI was verified
  with scripted Playwright passes during development.
