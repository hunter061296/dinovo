import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import tableRoutes from "./routes/tables";
import guestRoutes from "./routes/guests";
import shiftRoutes from "./routes/shifts";
import reservationRoutes from "./routes/reservations";
import waitlistRoutes from "./routes/waitlist";
import reportRoutes from "./routes/reports";

export function createApp() {
  const app = express();

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

  return app;
}
