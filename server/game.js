import crypto from 'node:crypto';
import Constants from '../src/constants/index.js';
import Room from './room.js';
import logger from './logger.js';
import { hasProfanity, censor } from './dictionary.js';

const MAX_ROOM_SIZE = 6;
const MAX_ROOMS = 500;
const MAX_BOT_ROOMS = 40;
const RECONNECT_GRACE_MS = 120_000;   // phones background tabs: hold a dropped player's seat for 2 minutes
const IDLE_ROOM_MS = 30 * 60_000;

class Game {
  constructor(io) {
    this.io = io
    this.players = new Map();     // socket id -> { nickname, socket, room, key }
    this.rooms = new Map();
    this.publicRooms = []
    this.sessions = new Map();    // reconnect key -> socket id
    this.graceTimers = new Map(); // socket id -> timeout
    this.stats = { startedAt: Date.now(), roomsCreated: 0, roomsClosed: 0, gamesFinished: 0, joins: 0, reconnects: 0, peakPlayers: 0 };
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.matchmaker = setInterval(() => { for (const r of this.rooms.values()) { try { r.matchmake() } catch (e) { logger.error(`matchmake: ${e.stack}`) } } }, 3000);
    this.matchmaker.unref();
    this.reporter = setInterval(() => logger.info('stats', this.getStats()), 10 * 60_000);
    this.sweeper.unref(); this.reporter.unref();
  }

  getStats() {
    return {
      players: this.players.size,
      rooms: this.rooms.size,
      publicRooms: this.publicRooms.length,
      botRooms: this.countBotRooms(),
      uptimeMin: Math.round((Date.now() - this.stats.startedAt) / 60000),
      totals: { ...this.stats }
    }
  }

  countBotRooms() { let n = 0; for (const r of this.rooms.values()) if (r.bots.length) n++; return n }

  handlePlayerMessage(socket, message) {
    const player = this.players.get(socket.id)
    const room = this.getPlayerRoom(socket)
    if (!player || !room) return
    room.touch()
    if (!room.privateRoom && typeof message === 'string') message = censor(message)
    room.handlePlayerMessage({
      type: Constants.CHAT_MSG_TYPES.PLAYER_MESSAGE,
      player: room.players[socket.id]?.nickname || player.nickname,
      playerId: socket.id,
      message: message
    })
  }

  handlePlayerAction(socket, action) {
    const room = this.getPlayerRoom(socket)
    const p = room && room.players[socket.id]
    if (!p) return
    room.touch()
    room.handlePlayerCommand({ player: p.nickname, playerId: socket.id, action }, action.command, action.args)
  }

  getPlayerCount() { return this.players.size }

  getPlayerRoom(socket) {
    const player = this.players.get(socket.id)
    return player ? this.rooms.get(player.room) : undefined
  }

  newRoom(isPrivate) {
    if (this.rooms.size >= MAX_ROOMS) return null
    const id = crypto.randomBytes(20).toString('hex');
    this.rooms.set(id, new Room(this.io, id, isPrivate, { onGameEnd: () => { this.stats.gamesFinished++ } }));
    if (!isPrivate) this.publicRooms.push(id);
    this.stats.roomsCreated++
    return id
  }

  resolveRoom(roomId, isPrivate) {
    const existing = roomId && this.rooms.get(roomId)
    if (existing) {
      if (existing.privateRoom !== isPrivate) return null
      if (existing.humanCount() >= MAX_ROOM_SIZE) return null
      return roomId
    }
    if (roomId) return null
    if (isPrivate) return this.newRoom(true)
    for (const id of this.publicRooms) {
      const room = this.rooms.get(id)
      if (room && room.humanCount() < MAX_ROOM_SIZE) return id
    }
    return this.newRoom(false)
  }

  // Same browser coming back after a dropped connection: hand the old seat to the new socket
  tryReconnect(socket, key) {
    const oldId = key && this.sessions.get(key)
    const rec = oldId && this.players.get(oldId)
    const room = rec && this.rooms.get(rec.room)
    const seat = room && room.players[oldId]
    if (!seat || seat.connected) return false
    clearTimeout(this.graceTimers.get(oldId)); this.graceTimers.delete(oldId)
    this.players.delete(oldId)
    this.players.set(socket.id, { ...rec, socket })
    this.sessions.set(key, socket.id)
    socket.join(room.id)
    room.rekeyPlayer(oldId, socket)
    room.update()
    this.stats.reconnects++
    return true
  }

  addPlayer(socket, nickname, roomId, isPrivate = false, opts = {}) {
    if (this.players.has(socket.id)) return
    if (this.tryReconnect(socket, opts.key)) return
    const wantsBots = opts.bots > 0 && !roomId
    if (wantsBots) {
      isPrivate = true
      if (this.countBotRooms() >= MAX_BOT_ROOMS)
        return socket.emit(Constants.MSG_TYPES.ERROR, { message: "Bot games are busy right now. Try again in a minute!", exit: true })
    }
    const id = this.resolveRoom(roomId, isPrivate)
    if (!id) {
      const gone = roomId && !this.rooms.has(roomId)
      return socket.emit(Constants.MSG_TYPES.ERROR, { reason: gone ? 'gone' : 'full', exit: true,
        message: gone ? 'That game has ended (or the server restarted).' : 'That game is full or not open to you.' })
    }
    const room = this.rooms.get(id)
    if (!room.privateRoom && hasProfanity(nickname))
      return socket.emit(Constants.MSG_TYPES.ERROR, { message: 'Please pick a different name for public games.', exit: true })
    if (wantsBots && room.playerOrder.length === 0) room.addBots(opts.bots, opts.difficulty)
    logger.info('Player joined room', { room: id, socket: socket.id, bots: room.bots.length })
    this.players.set(socket.id, { nickname, socket, room: id, key: opts.key })
    if (opts.key) this.sessions.set(opts.key, socket.id)
    socket.join(id)
    room.addPlayer(socket, nickname, opts.key)
    if (wantsBots) room.setCurrentPlayer(socket.id)   // human goes first in bot games
    this.stats.joins++
    this.stats.peakPlayers = Math.max(this.stats.peakPlayers, this.players.size)
    room.update()
  }

  // Clicked "leave": gone for good, immediately
  leaveRoom(socket) {
    this.dropPlayer(socket.id)
  }

  // Connection lost (tab closed, wifi, phone locked): keep the seat for a while so they can come back
  removePlayer(socket) {
    const rec = this.players.get(socket.id)
    const room = rec && this.rooms.get(rec.room)
    if (!room || !room.players[socket.id]) return this.dropPlayer(socket.id)
    room.markDisconnected(socket.id)
    room.update()
    this.graceTimers.set(socket.id, setTimeout(() => this.dropPlayer(socket.id), RECONNECT_GRACE_MS))
  }

  dropPlayer(socketId) {
    clearTimeout(this.graceTimers.get(socketId)); this.graceTimers.delete(socketId)
    const rec = this.players.get(socketId)
    if (!rec) return
    this.players.delete(socketId)
    if (rec.key && this.sessions.get(rec.key) === socketId) this.sessions.delete(rec.key)
    const room = this.rooms.get(rec.room)
    if (!room) return
    rec.socket.leave?.(room.id)
    room.removePlayerFully(socketId)
    if (room.isEmpty()) this.closeRoom(room, 'empty')
    else room.update()
  }

  closeRoom(room, reason, message) {
    logger.info('Closing room', { room: room.id, reason, ageMin: Math.round((Date.now() - room.createdAt) / 60000) })
    if (message) this.io.in(room.id).emit(Constants.MSG_TYPES.ERROR, { message, exit: true })
    for (const [sid, rec] of this.players) {
      if (rec.room !== room.id) continue
      clearTimeout(this.graceTimers.get(sid)); this.graceTimers.delete(sid)
      if (rec.key && this.sessions.get(rec.key) === sid) this.sessions.delete(rec.key)
      this.players.delete(sid)
      rec.socket.leave?.(room.id)
    }
    room.destroy()
    this.rooms.delete(room.id)
    const idx = this.publicRooms.indexOf(room.id)
    if (idx >= 0) this.publicRooms.splice(idx, 1)
    this.stats.roomsClosed++
  }

  // Safety net: close abandoned rooms and rooms nobody has touched for a long time
  sweep() {
    const now = Date.now()
    for (const room of [...this.rooms.values()]) {
      if (room.isEmpty()) this.closeRoom(room, 'swept-empty')
      else if (now - room.lastActivity > IDLE_ROOM_MS)
        this.closeRoom(room, 'idle', 'This game was closed after 30 minutes of inactivity.')
    }
  }
}

export default Game;
