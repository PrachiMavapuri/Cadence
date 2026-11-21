import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext({ socket: null, connected: false });

export function SocketProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!isAuthenticated || !user || !token) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const client = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    client.on('connect', () => setConnected(true));
    client.on('disconnect', () => setConnected(false));

    setSocket(client);

    return () => {
      client.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [isAuthenticated, user?.id]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
