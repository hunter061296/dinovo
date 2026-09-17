import "dotenv/config";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app";

const PORT = Number(process.env.PORT) || 4000;

const app = createApp();
const httpServer = http.createServer(app);

// Socket.io wiring is minimal for now — table-status/waitlist broadcasts land in Phase 5.
export const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" },
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`Socket disconnected: ${socket.id}`));
});

httpServer.listen(PORT, () => {
  console.log(`Dinovo server listening on http://localhost:${PORT}`);
});
