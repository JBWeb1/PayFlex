import { io } from 'socket.io-client';

const url = import.meta.env.VITE_SOCKET_URL || undefined; // same origin by default

export const connectSocket = (token) =>
  io(url, { auth: token ? { token } : undefined, transports: ['websocket', 'polling'] });
