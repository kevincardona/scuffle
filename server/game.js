const Constants = require('../src/constants');
const crypto    = require('crypto');
const Room = require('./room');
const { loggers } = require('winston')
const logger = loggers.get('main-logger')

class Game {
  constructor(io) {
    this.io = io
    this.players = {};
    this.rooms = {};
    this.playerCount = 0;
    this.lastUpdateTime = Date.now();
    this.shouldSendUpdate = false;
  }

  getPlayerRoom(socket) {
    if (this.players[socket.id])
      return this.rooms[this.players[socket.id].room]
  }

  createPrivateRoom() {
    let room = crypto.randomBytes(20).toString('hex');
    if (this.rooms[room])
      return this.createPrivateRoom()
    this.rooms[room] = new Room(this.io, room, true);
    return room
  }

  handlePlayerMessage(socket, message) {
    if (!this.players[socket.id]) return logger.error(`Unable to handle unregistered player action with socket id: ${socket.id}`)
    const data = {
      type: Constants.CHAT_MSG_TYPES.PLAYER_MESSAGE,
      player: this.players[socket.id].nickname,
      playerId: socket.id,
      message: message
    }
    this.getPlayerRoom(socket).handlePlayerMessage(data)
  }

  handlePlayerAction(socket, action) {
    if (!this.players[socket.id]) return logger.error(`Unable to handle unregistered player action with socket id: ${socket.id}`)
    const data = {
      player: this.players[socket.id].nickname,
      playerId: socket.id,
      action: action
    }
    this.getPlayerRoom(socket).handlePlayerCommand(data, action.command, action.args)
  }

  addPlayer(socket, nickname, room) {
    logger.info(`Player ${nickname} has joined room ${room} with socket id: ${socket.id}`)
    if (!room) { room = this.createPrivateRoom() }
    if (this.players[socket.id])
      return this.rooms[room].addPlayer(socket, nickname)
    if (this.rooms[room]) {
      this.rooms[room].addPlayer(socket, nickname)
    } else {
      this.rooms[room] = new Room(this.io, room)
      this.rooms[room].addPlayer(socket, nickname, room)
    }
    socket.join(room)
    this.players[socket.id] = {
      nickname: nickname,
      socket: socket,
      room: room
    }
    this.playerCount = this.playerCount + 1
  }

  leaveRoom(socket) {
    const room = this.getPlayerRoom(socket)
    if (room) {
      room.removePlayer(socket)
      socket.leave(room.id, () => {
        if (room.playerCount === 0) {
          logger.info(`No players left in room:${room.id}. Deleting...`)
          this.rooms[room.id] = null
          room.destroy()
          delete this.rooms[room.id]
        }
      })
    }
  }

  removePlayer(socket) {
    logger.info(`Removing player with socket id: ${socket.id}`)
    this.leaveRoom(socket)
    delete this.players[socket.id];
    this.playerCount = this.playerCount - 1
  }
}

module.exports = Game;