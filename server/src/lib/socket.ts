import type { Server } from "socket.io";

// index.ts creates the actual io instance (it needs the http server first); routes just need
// a way to reach it without a circular import back to index.ts.
let io: Server | null = null;

export function setIO(instance: Server) {
  io = instance;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io has not been initialized yet");
  return io;
}
