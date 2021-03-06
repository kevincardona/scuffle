const Constants = require('../src/constants');
const helpers = require('./utils/helpers');
const Player = require('./player');
const checkWord = require('check-word'), words = checkWord('en');
const { loggers } = require('winston');
const logger = loggers.get('main-logger');

class Room {
  constructor(io, id, privateRoom=false) {
    this.id = id;
    this.privateRoom = privateRoom;
    this.playerCount = 0
    this.players = {}
    this.playerOrder = []
    this.overrides = {}
    this.currentPlayer = 0
    this.flipped = new Array(Constants.GAME.TILE_COUNT);
    this.currentPlayer = null;
    this.pausedPlayer = null;
    this.paused = false;
    this.io = io;
    this.turnTimeout = null;
    this.pausedTimeout = null;
    this.updateInterval = setInterval(this.update.bind(this), 2000);
    this.generateTable();
  }

  isEmpty() {
    return this.activePlayerCount() === 0
  }

  activePlayerCount() {
   return Object.keys(this.players).reduce((total, playerId) => {
      if (this.players[playerId].active)
        return total + 1;
      return total
    }, 0)
  }

  destroy() {
    clearInterval(this.updateInterval)
    delete this
  }

  generateTable() {
    this.unflipped = []
    this.flipped = []
    Object.keys(Constants.GAME.LETTER_DISTRIBUTION).forEach((letter)=>{
      for (let i = 0; i < Constants.GAME.LETTER_DISTRIBUTION[letter]; i++)
        this.unflipped.push(letter)
    })
    this.unflipped = helpers.shuffle(this.unflipped)
    this.letterIndex = {}
  }
  
  resetGame() {
    Object.keys(this.players).forEach((player) => {
      this.players[player].words = []
      this.players[player].score = 0;
    })
    this.generateTable();
    this.removeInactivePlayers();
  }

  removeInactivePlayers() {
    this.playerOrder.forEach((playerId, index) => {
      let player = this.players[playerId]
      if (player.active) return 
      this.playerOrder.splice(this.playerOrder.indexOf(playerId),1);
      this.playerCount--;
      delete this.players[playerId]
    })
  }

  getCurrentPlayer() {
    return this.players[this.playerOrder[this.currentPlayer % this.playerOrder.length]]
  }

  getCurrentPlayerId() {
    const player = this.playerOrder[this.currentPlayer % this.playerOrder.length]
    if (!this.players[player].active)
      this.nextPlayer()
    return this.playerOrder[this.currentPlayer % this.playerOrder.length]
  }

  setCurrentPlayer(playerId) {
    const index = this.playerOrder.indexOf(playerId)
    if (index >= 0)
      this.currentPlayer = this.playerOrder.indexOf(playerId)
  }

  nextPlayer() {
    clearTimeout(this.turnTimeout)
    if (this.activePlayerCount() === 1)
      return
    this.currentPlayer = (this.currentPlayer + 1) % this.playerOrder.length
    if (this.unflipped.length !== 0) {
      this.sendRoomMessage(`${this.getCurrentPlayer().nickname}'s turn!`)
      this.turnTimeout = setTimeout(()=> {
        this.sendRoomMessage(`${this.getCurrentPlayer().nickname} took to long to go! Who's next?`)
        this.nextPlayer()
      }, Constants.GAME.TURN_TIMEOUT)
    }
    if (!this.getCurrentPlayer().active && this.activePlayerCount() > 0)
      return this.nextPlayer();
  }

  getRoomData() {
    const players = Object.keys(this.players).map((player) => this.players[player].getPlayerData())
    const data = {
      roomName: this.privateRoom ? "Private Game" : "Public Game",
      roomId: this.id,
      unflippedCount: this.unflipped.length,
      flipped: this.flipped,
      players: players,
      currentPlayer: this.getCurrentPlayerId(),
      privateRoom: this.privateRoom,
      pausedPlayer: this.pausedPlayer,
      paused: this.paused
    }
    
    return data;
  }

  getSocket(playerId) {return this.players[playerId].socket}

  update() {
    if (!this.isEmpty())
      this.io.in(this.id).emit(Constants.MSG_TYPES.GAME_UPDATE, this.getRoomData())    
  }

  flipTile(data) {
    let newLetter = this.unflipped.pop()
    if (!newLetter) return
    this.flipped.push(newLetter);
    this.sendRoomMessage(`${data.player} flipped the letter ${newLetter}`)
    if (this.unflipped.length === 0)
      this.sendRoomMessage(`There are no letters left to flip! If you don't see any more words to create/steal click the "Finished" button to end the game!`)
    this.nextPlayer()
  }

  overrideWord(data, word) {
    if (this.privateRoom) {
      this.overrides[word.toLowerCase()] = true
      this.sendRoomMessage(`${this.players[data.playerId].nickname} has added the word: ${word} to the dictionary!`)
    }
  }

  takeFromCenter(letterIndex) {
    this.flipped = this.flipped.filter((_, index) => {
      return letterIndex[index] === undefined
    })
  }

  isValidWord(data, word, stealing = false) {
    word = word.toLowerCase()
    if ((word == null || (word.length < 3) && this.overrides[word] == null)) {
      this.sendPrivateMessage(this.getSocket(data.playerId), 'Your word needs to be real and at least 3 characters long!')
      if (!stealing)
        this.sendRoomMessage(`${this.players[data.playerId].nickname} tried to make the INVALID word ${word.toUpperCase()}`)
      return false
    }
    if (words.check(word.toLowerCase()) || this.overrides[word] != null)
      return true
    if (!stealing)
      this.sendRoomMessage(`${this.players[data.playerId].nickname} tried to make the INVALID word ${word.toUpperCase()}`)
    return false
  }

  createWord(data, word, stealing = false) {
    if (!stealing && !this.isValidWord(data, word, stealing)) {return}
    const letterIndex = helpers.checkCenterForWord(word, this.flipped);
    const player = this.players[data.playerId]
    if (letterIndex !== false && !stealing) {
      this.players[data.playerId].addWord(word)
      this.takeFromCenter(letterIndex)
      this.sendRoomMessage(`${player.nickname} made the word: ${word.toUpperCase()}`)
      this.setCurrentPlayer(data.playerId)
      return true;
    } else if (letterIndex !== false) {
      this.takeFromCenter(letterIndex)
      return true;
    } else {
      if (!stealing)
        this.sendRoomMessage(`${player.nickname} tried to make the word ${word.toUpperCase()}`)
      return false;
    }
  }

  stealWord(data, victim, oldWord, newWord) {
    logger.info(`${this.players[data.playerId].nickname} attempting to steal the word: ${oldWord} to create: ${newWord}`)
    if (typeof(oldWord) !== 'string' || typeof(newWord) !== 'string') return
    oldWord = oldWord.toUpperCase()
    newWord = newWord.toUpperCase()
    let newWordMap = helpers.letterCountMap(newWord)
    let oldWordMap = helpers.letterCountMap(oldWord)
    const difference = helpers.checkWordContainsOther(newWordMap, oldWordMap)
    if (!this.players[victim]|| !this.players[victim].hasWord(oldWord)) {
      return this.sendPrivateMessage(data.playerId, `Seems like someone must have taken that word before you!`)
    }
    if (!difference ||  !this.isValidWord(data, newWord, true)) {
      return this.sendRoomMessage(`${this.players[data.playerId].nickname} attempted to steal the word: ${oldWord} to create the invalid word: ${newWord}`);
    }
    if (this.createWord(data, helpers.letterMapToWord(difference), true)) {
      this.players[data.playerId].addWord(newWord);
      this.players[victim].removeWord(oldWord);
      this.setCurrentPlayer(data.playerId)
      return this.sendRoomMessage(`${this.players[data.playerId].nickname} stole the word: ${oldWord} to create: ${newWord}!!!`)
    }
    this.sendRoomMessage(`${this.players[data.playerId].nickname} attempted to steal the word: ${oldWord} to create the INVALID word: ${newWord}`);
  }

  putBackWord(data, word) {
    let player = this.players[data.playerId]
    if (player.hasWord(word)) {
      player.removeWord(word)
      this.sendRoomMessage(`${player.nickname} put ${word} back into the mix!`)
      this.flipped = this.flipped.concat([...word])
    } else {
      return this.sendPrivateMessage(player.socket, `Failed to put back word ${word}! Are you sure that's not someone elses?`);
    }
  }

  handlePlayerMessage(data) {
    if (data.message && data.message[0] === '/') {
      const commands = data.message.slice(1,).toUpperCase().split(' ')
      this.handlePlayerCommand(data, commands[0], commands.slice(1))
    } else {
      this.sendMessage(data)
    }
  }

  playerIsDone(data) {
    this.players[data.playerId].isDone = true;
    let done = this.playerOrder.reduce((total, playerId) => {
      if (this.players[playerId].isDone)
        return total + 1;
      return total
    }, 0)
    this.sendRoomMessage(`${this.players[data.playerId].nickname} is done! ${done}/${this.playerOrder.length} players done.`)
    this.endGame();
  }

  endGame() {
    let winners = [];
    let topScore = -1;
    let player;
    for(let i = 0; i < this.playerOrder.length; i++) {
      player = this.players[this.playerOrder[i]]
      if (!player.isDone) {
        return
      }
      if (player.score > topScore) {
        topScore = player.score;
        winners = [player]
      } else if (player.score === topScore) {
        winners.push(player);
      }
    }
    if (winners.length === 1)
      this.sendRoomMessage(`${winners[0].nickname} has won with ${topScore} points!`)
    else {
      let winnerNames = ''
      for (let i = 0; i < winners.length; i++) {
        if (i < winners.length - 1 && i !== 0)
          winnerNames = winnerNames + ', ' + winners[i].nickname;
        else if (i === 0)
          winnerNames = winnerNames + winners[i].nickname
        else if (i === winners.length - 1 && winners.length > 2)
          winnerNames = winnerNames + ', and ' + winners[i].nickname
        else 
          winnerNames = winnerNames + ' and ' + winners[i].nickname
      }
      this.sendRoomMessage(`${winnerNames} have tied for first with ${topScore} points!`)
    }
    this.resetGame()
  }

  unpauseGame(playerId) {
    if (playerId !== this.pausedPlayer) return
    this.pausedPlayer = null;
    this.paused = false;
    if (this.pausedTimeout)
      clearTimeout(this.pausedTimeout)
  }

  pauseGame(playerId) {
    if (this.paused) return
    this.paused = true
    this.pausedPlayer = playerId
    this.pausedTimeout = setTimeout(()=>{
      this.pausedPlayer = null;
      this.paused = false;
    }, Constants.GAME.PAUSED_TIMEOUT)
  }

  hasMove(playerId) {
    return playerId === this.pausedPlayer
  }

  handlePlayerCommand(data, command, args) {
    switch(command) {
      case Constants.COMMANDS.FLIP:
        if (this.getCurrentPlayerId() === data.playerId)
          this.flipTile(data); 
        break;
      case Constants.COMMANDS.CREATE_WORD:
        if (!this.hasMove(data.playerId)) break;
        this.createWord(data, args[0]); 
        break;
      case Constants.COMMANDS.STEAL_WORD:
        if (!args[0] || !this.hasMove(data.playerId)) break;
        this.stealWord(data, args[0].playerId, args[0].word, args[1]); 
        break;
      case Constants.COMMANDS.RETURN:
        this.putBackWord(data, args[0])
        break;
      case Constants.COMMANDS.OVERRIDE:
        if (this.privateRoom)
          this.overrideWord(data, args[0])
        else
          this.sendPrivateMessage(this.getSocket(data.playerId), `You can't use that command in a public room!`)
        break;
      case Constants.COMMANDS.RESET:
        if (this.privateRoom)
          this.resetGame()
        else
          this.sendPrivateMessage(this.getSocket(data.playerId), `You can't use that command in a public room!`)
        break;
      case Constants.COMMANDS.DONE:
        this.playerIsDone(data);
        break;
      case Constants.COMMANDS.RULES:
        this.sendPrivateMessage(this.getSocket(data.playerId), Constants.SERVER_PROMPTS.RULES);
        break;
      case Constants.COMMANDS.PAUSE_GAME:
        this.pauseGame(data.playerId)
        break;
      case Constants.COMMANDS.UNPAUSE_GAME:
        this.unpauseGame(data.playerId)
        break;
      default:
        this.sendPrivateMessage(this.getSocket(data.playerId), `Command not found!`);
    }
    this.update();
  }

  sendRules(data) {
    this.sendPrivateMessage(this.getSocket(data.playerId), Constants.SERVER_PROMPTS.RULES);
  }

  sendPrivateMessage(socket, message) {
    const data = {
      type: Constants.CHAT_MSG_TYPES.SERVER_MESSAGE,
      typeModifier: Constants.CHAT_MSG_TYPES.MODIFIERS.PRIVATE,
      message: message
    }
    socket.emit(Constants.MSG_TYPES.MESSAGE, data)
  }

  sendRoomMessage(message) {
    const data = {
      type: Constants.CHAT_MSG_TYPES.SERVER_MESSAGE,
      message: message
    }
    this.sendMessage(data)
  }
  
  sendMessage(data) {
    switch (data.type) {
      case Constants.CHAT_MSG_TYPES.SERVER_MESSAGE:
        return this.io.in(this.id).emit(Constants.MSG_TYPES.MESSAGE, data) 
      case Constants.CHAT_MSG_TYPES.PLAYER_MESSAGE:
        return this.io.in(this.id).emit(Constants.MSG_TYPES.MESSAGE, data) 
      default:
        return
    }
  }

  addPlayer(socket, nickname) {
    logger.info(`Adding player ${nickname} to room ${this.id}`)
    this.players[socket.id] = new Player(socket, nickname, this.id)
    this.playerOrder.push(socket.id);
    this.playerCount = this.playerCount + 1
    this.sendRoomMessage(`${nickname} has joined the room!`)
  }

  removePlayer(socket) {
    if (!this.players[socket.id]) return logger.error(`Attempted to remove nonexistent player: ${socket.id} from room: ${this.id}`)
    this.players[socket.id].active = false
    this.players[socket.id].isDone = true
    this.sendRoomMessage(`${this.players[socket.id].nickname} has left the room!`)
  }
}

module.exports = Room;