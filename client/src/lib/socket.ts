import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_BASE_URL, getToken } from "./api";

const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

// A single shared connection for the whole app — pages subscribe/unsubscribe to events on
// mount/unmount but never open a second socket. The server rejects a handshake without a valid
// JWT; `auth` is a callback so each reconnect attempt re-reads the current token.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getToken() }) });
  }
  return socket;
}

// Called on logout so the next user's session doesn't inherit a connection authenticated as the
// previous one.
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

// Whether live updates are currently flowing — drives the "Reconnecting..." banner in Layout, so
// a dropped connection is visible instead of the floor plan silently going stale. Starts as
// "connected" so the banner doesn't flash during the initial handshake.
export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    const s = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onDisconnect);
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onDisconnect);
    };
  }, []);
  return connected;
}
