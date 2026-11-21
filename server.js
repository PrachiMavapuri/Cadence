import express from 'express';
import http from 'node:http';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { createApiApp, attachFinalErrorHandler } from './server/app.js';
import { env } from './server/config/env.js';
import { initDb } from './server/db/database.js';
import { setSocketServer } from './server/services/realtime.js';

async function startServer() {
  await initDb();

  const app = createApiApp();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Unauthorized socket connection'));
    }
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      if (!decoded.sub || decoded.type !== 'access') {
        return next(new Error('Invalid socket token'));
      }
      socket.data.userId = decoded.sub;
      next();
    } catch {
      next(new Error('Invalid socket token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
  });

  setSocketServer(io);

  if (env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  attachFinalErrorHandler(app);

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Cadence server running on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Cadence server:', err);
  process.exit(1);
});
