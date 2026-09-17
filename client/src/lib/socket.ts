import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./api";

const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

// A single shared connection for the whole app — pages subscribe/unsubscribe to events on
// mount/unmount but never open a second socket.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL);
  }
  return socket;
}
