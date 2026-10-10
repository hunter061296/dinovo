import express, { type ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import tableRoutes from "./routes/tables";
import guestRoutes from "./routes/guests";
import shiftRoutes from "./routes/shifts";
import reservationRoutes from "./routes/reservations";
import waitlistRoutes from "./routes/waitlist";
import reportRoutes from "./routes/reports";
import sectionRoutes from "./routes/sections";
import turnTimeRoutes from "./routes/turnTimes";
import combinationRoutes from "./routes/combinations";
import blockRoutes from "./routes/blocks";
import { authenticate } from "./middleware/auth";
import { RESTAURANT_TIMEZONE } from "./lib/time";

export function createApp() {
  const app = express();

  // This service only ever returns JSON, never HTML — the page-oriented directives (CSP,
  // COEP/CORP) assume a browser is rendering markup served from here, so they're disabled.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/tables", tableRoutes);
  app.use("/api/guests", guestRoutes);
  app.use("/api/shifts", shiftRoutes);
  app.use("/api/reservations", reservationRoutes);
  app.use("/api/waitlist", waitlistRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/sections", sectionRoutes);
  app.use("/api/turn-times", turnTimeRoutes);
  app.use("/api/table-combinations", combinationRoutes);
  app.use("/api/table-blocks", blockRoutes);
  // Lets the client notice when the device's clock is in a different zone than the restaurant
  // (every day/time the server computes is in the restaurant's zone — see lib/time.ts).
  app.get("/api/config", authenticate, (_req, res) => res.json({ timeZone: RESTAURANT_TIMEZONE }));

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);

  return app;
}

// Express 5 forwards a rejected promise from any async route handler here (Express 4 dropped it,
// and Node then exited on the unhandled rejection — one bad request took down every screen).
// Known Prisma errors map to the client error they actually represent; anything else is a 500.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Record not found" });
    if (err.code === "P2003") return res.status(400).json({ error: "A referenced record doesn't exist" });
    if (err.code === "P2002") return res.status(409).json({ error: "That record already exists" });
  }
  // body-parser's malformed-JSON error carries its own 4xx status.
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.expose ? err.message : "Bad request" });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
};
