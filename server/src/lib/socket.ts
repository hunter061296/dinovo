import type http from "http";
import { Server } from "socket.io";
import { verifyToken } from "./jwt";
import { prisma } from "./prisma";

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

// Every broadcast carries guest names (and waitlist phone numbers), so a connection has to
// present the same JWT the REST API requires — checked once at handshake, with the same
// "deactivated users are out" rule as GET /auth/me.
export function createSocketServer(httpServer: http.Server, clientOrigin: string): Server {
  const server = new Server(httpServer, { cors: { origin: clientOrigin } });

  server.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      return next(new Error("Missing authentication token"));
    }
    try {
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) return next(new Error("Invalid session"));
      socket.data.user = payload;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  return server;
}
