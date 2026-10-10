import http from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as connect } from "socket.io-client";
import { createSocketServer } from "../src/lib/socket";
import { prisma } from "../src/lib/prisma";
import { makeUser } from "./helpers";

let httpServer: http.Server;
let url: string;

beforeAll(async () => {
  httpServer = http.createServer();
  createSocketServer(httpServer, "http://localhost");
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => httpServer.close(() => resolve())));

function tryConnect(auth: Record<string, unknown>): Promise<"connected" | string> {
  return new Promise((resolve) => {
    const socket = connect(url, { auth, reconnection: false, transports: ["websocket"] });
    socket.on("connect", () => {
      socket.close();
      resolve("connected");
    });
    socket.on("connect_error", (err) => {
      socket.close();
      resolve(err.message);
    });
  });
}

describe("live-update socket", () => {
  it("rejects a connection without a token", async () => {
    expect(await tryConnect({})).toMatch(/missing/i);
  });

  it("rejects a forged token", async () => {
    expect(await tryConnect({ token: "not-a-jwt" })).toMatch(/invalid/i);
  });

  it("accepts a signed-in user", async () => {
    const { token } = await makeUser("HOST");
    expect(await tryConnect({ token })).toBe("connected");
  });

  it("rejects a deactivated user's still-unexpired token", async () => {
    const { token, user } = await makeUser("HOST");
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await tryConnect({ token })).toMatch(/invalid session/i);
  });
});
