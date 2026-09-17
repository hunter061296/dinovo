# Dinovo — Restaurant Host Stand

An internal host-stand and reservation management tool for a single restaurant
location: floor plan, live table status, the reservation book, a walk-in
waitlist, a guestbook, shift/pacing configuration, and a reporting dashboard.
There is no guest-facing booking site, no payments, and no ordering — see
[NOTES.md](./NOTES.md) for what's stubbed and out of scope.

## Tech stack

- **Client**: React + TypeScript + Vite + Tailwind CSS v4 + React Router + TanStack Query + dnd-kit
- **Server**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT + bcrypt, role-based access control (Admin / Manager / Host)
- **Realtime**: Socket.io (live table status + waitlist updates across screens)

## Prerequisites

- Node.js 20+ (developed against Node 22)
- PostgreSQL 14+ running locally (or reachable via `DATABASE_URL`)

## Setup

### 1. Database

Create a database and a user for it (adjust names/password as you like):

```bash
sudo -u postgres psql -c "CREATE USER dinovo WITH PASSWORD 'dinovo_dev_pw' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE dinovo OWNER dinovo;"
```

### 2. Server

```bash
cd server
npm install
cp .env.example .env        # edit DATABASE_URL/JWT_SECRET if yours differ
npx prisma migrate dev      # creates tables
npm run seed                # floor plan, guests, shifts, a day of reservations
npm run dev                 # http://localhost:4000
```

### 3. Client

In a second terminal:

```bash
cd client
npm install
cp .env.example .env        # VITE_API_URL, defaults to http://localhost:4000/api
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 and log in with one of the seeded accounts (all
password `password123`):

| Email                  | Role    |
|------------------------|---------|
| `admin@dinovo.test`    | Admin   |
| `manager@dinovo.test`  | Manager |
| `host@dinovo.test`     | Host    |

## Project structure

```
server/
  prisma/schema.prisma   Postgres schema
  prisma/seed.ts         Seed script (floor plan, guests, shifts, reservations)
  src/routes/            One file per resource (auth, users, tables, guests, ...)
  src/lib/               Shared helpers (jwt, socket.io, pacing/report math)
  src/middleware/        authenticate / authorize (RBAC)

client/
  src/pages/             One page component per route
  src/components/        Grouped by feature (floorplan/, reservations/, ...)
  src/lib/               API client, socket client, auth context, shared types
```

## Useful scripts

| Location | Command | What it does |
|---|---|---|
| `server/` | `npm run dev` | Start the API with hot reload |
| `server/` | `npm run seed` | Reset and reseed the database |
| `server/` | `npx prisma studio` | Browse the database visually |
| `server/` | `npx prisma migrate dev` | Apply schema changes |
| `client/` | `npm run dev` | Start the Vite dev server |
| `client/` | `npm run build` | Typecheck + production build |

## Roles

- **Admin** — everything, plus user management (create/deactivate Manager and Host accounts)
- **Manager** — everything except user management: floor plan, shifts/pacing, reports
- **Host** — reservation book, table status, waitlist, guestbook — no floor plan editing or shift/pacing config

## Tablet use

This is built for hosts working from an iPad at the stand. It's been tested at
iPad portrait (768×1024) and landscape (1024×768) widths — the floor plan
canvas scales down to fit rather than requiring horizontal scrolling.
