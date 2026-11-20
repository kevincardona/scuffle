import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import compression from 'compression';
import { Server } from 'socket.io';
import Constants from '../src/constants/index.js';
import Game from './game.js';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3001;
const buildDir = path.join(__dirname, '../build');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  // AdSense injects third-party scripts/frames; a strict CSP would break it
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(compression());

// Vite emits content-hashed files under /assets, safe to cache forever; the rest revalidate.
app.use(express.static(buildDir, {
  setHeaders: (res, file) => {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));
// Real URLs (/play etc.) are handled by the client router: serve the app for any non-file, non-API path
app.get(/^\/(?!api\/|socket\.io\/|healthz)[^.]*$/, (_, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(buildDir, 'index.html')));

const server = createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 4 * 1024,
  pingInterval: 20000,
  pingTimeout: 20000,
  connectTimeout: 10000
});
const game = new Game(io);

app.get('/api/playercount', (_, res) => {
  res.set('Cache-Control', 'no-store').send({ success: true, playerCount: game.getPlayerCount() })
});
app.get('/api/stats', (_, res) => res.set('Cache-Control', 'no-store').send(game.getStats()));
app.get('/healthz', (_, res) => res.send('ok'));

// ---- input validation / rate limiting -------------------------------------------------------
const MAX_CONNECTIONS_PER_IP = 20;
const connectionsByIp = new Map();

const clean = (s, max) =>
  // strip control and zero-width/bidi characters, collapse whitespace
  s.replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

const COMMAND_SET = new Set(Object.values(Constants.COMMANDS));

// Token bucket: `burst` events instantly, refilled at `perSecond`
function limiter(burst, perSecond) {
  let tokens = burst, last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

io.on('connection', socket => {
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',').pop().trim() || socket.handshake.address;
  const count = (connectionsByIp.get(ip) || 0) + 1;
  if (count > MAX_CONNECTIONS_PER_IP) return socket.disconnect(true);
  connectionsByIp.set(ip, count);

  logger.info('Player connected', { socket: socket.id });
  const allow = limiter(15, 5);

  // Wrap every handler: drop flooded events, and never let a bad payload crash the process.
  const on = (event, handler) => socket.on(event, (...args) => {
    if (!allow()) return;
    try { handler(...args) } catch (err) { logger.error(`Handler error on ${event}: ${err.stack}`) }
  });

  on(Constants.MSG_TYPES.JOIN_ROOM, (data) => {
    if (!data || typeof data !== 'object' || typeof data.nickname !== 'string') return;
    const nickname = clean(data.nickname, 15);
    if (!nickname) return;
    const room = typeof data.room === 'string' && /^[a-f0-9]{40}$/.test(data.room) ? data.room : undefined;
    const key = typeof data.key === 'string' && /^[a-f0-9-]{36}$/.test(data.key) ? data.key : undefined;
    const bots = Number.isInteger(data.bots) && data.bots >= 1 && data.bots <= 3 ? data.bots : 0;
    const difficulty = ['easy', 'medium', 'hard'].includes(data.difficulty) ? data.difficulty : 'medium';
    game.addPlayer(socket, nickname, room, data.isPrivate === true, { key, bots, difficulty });
  });
  on(Constants.MSG_TYPES.LEAVE_ROOM, () => game.leaveRoom(socket));
  on(Constants.MSG_TYPES.MESSAGE, (message) => {
    if (typeof message !== 'string') return;
    message = clean(message, 200);
    if (message) game.handlePlayerMessage(socket, message);
  });
  on(Constants.MSG_TYPES.PLAYER_ACTION, (action) => {
    if (!action || typeof action !== 'object' || !COMMAND_SET.has(action.command)) return;
    if (action.args !== undefined && (!Array.isArray(action.args) || action.args.length > 2)) return;
    game.handlePlayerAction(socket, { command: action.command, args: action.args });
  });

  socket.on('disconnect', () => {
    try { game.removePlayer(socket) } catch (err) { logger.error(`Disconnect error: ${err.stack}`) }
    const left = (connectionsByIp.get(ip) || 1) - 1;
    if (left <= 0) connectionsByIp.delete(ip); else connectionsByIp.set(ip, left);
  });
});

process.on('unhandledRejection', (err) => logger.error(`Unhandled rejection: ${err?.stack || err}`));
process.on('uncaughtException', (err) => logger.error(`Uncaught exception: ${err?.stack || err}`));

server.listen(port, () => logger.info(`Server listening on port ${port}`));

const shutdown = () => { io.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
