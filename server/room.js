import crypto from 'node:crypto';
import Constants from '../src/constants/index.js';
import * as helpers from './utils/helpers.js';
import Player from './player.js';
import Bot, { DIFFICULTIES } from './bot.js';
import { isWord, isBlocked, censor } from './dictionary.js';
import { sameRoot } from './utils/roots.js';
import logger from './logger.js';

const WORD_RE = /^[A-Za-z]{1,30}$/;
const LOCK_COOLDOWN_MS = 8000;   // after a pause that didn't produce a word
const TARGET_PLAYERS = 3;          // public games try to have this many players
const FILL_AFTER_MS = Number(process.env.FILL_AFTER_MS) || 20_000;       // how long a lonely public game waits for real players before bots join
const OOPS = [
  (p, w) => `${p} tried ${w}. The dictionary says no 📖`,
  (p, w) => `${p} invented a new word: ${w}. Bold! 🙈`,
  (p, w) => `Nice try, ${p}: ${w} isn't a word 🤔`,
  (p, w) => `${w}? ${p}, that's not in any dictionary we know 🧐`,
];
const BOT_NAMES = ['Botty', 'Lexi', 'Wordsworth', 'Tilly', 'Scrabbles', 'Alphie'];

class Room {
  constructor(io, id, privateRoom = false, hooks = {}) {
    this.id = id;
    this.privateRoom = privateRoom;
    this.hooks = hooks;
    this.players = Object.create(null)
    this.playerOrder = []
    this.overrides = new Set()
    this.currentPlayer = 0
    this.pausedPlayer = null;
    this.paused = false;
    this.io = io;
    this.turnTimeout = null;
    this.pausedTimeout = null;
    this.bots = [];
    this.botInterval = null;
    this.pausedAt = 0;
    this.lastHumanJoinAt = Date.now();
    this.lockStreak = { id: null, count: 0 };
    this.createdAt = this.lastActivity = Date.now();
    this.updateInterval = setInterval(this.update.bind(this), 2000);
    this.generateTable();
  }

  humanCount() { return this.playerOrder.filter((id) => !this.players[id].bot).length }
  isEmpty() { return this.humanCount() === 0 }
  activePlayerCount() { return this.playerOrder.length }
  touch() { this.lastActivity = Date.now() }

  destroy() {
    clearInterval(this.updateInterval)
    clearInterval(this.botInterval)
    clearTimeout(this.turnTimeout)
    clearTimeout(this.pausedTimeout)
  }

  generateTable() {
    this.unflipped = []
    this.flipped = []
    Object.keys(Constants.GAME.LETTER_DISTRIBUTION).forEach((letter)=>{
      for (let i = 0; i < Constants.GAME.LETTER_DISTRIBUTION[letter]; i++)
        this.unflipped.push(letter)
    })
    this.unflipped = helpers.shuffle(this.unflipped)
  }

  resetGame() {
    Object.values(this.players).forEach((p) => { p.words = []; p.score = 0; p.isDone = false })
    this.bots.forEach((b) => b.reset())
    this.generateTable();
  }

  uniqueName(name) {
    const taken = new Set(Object.values(this.players).map((p) => p.nickname.toLowerCase()))
    let candidate = name, n = 2
    while (taken.has(candidate.toLowerCase())) candidate = `${name} ${n++}`
    return candidate
  }

  getCurrentPlayer() {
    return this.players[this.playerOrder[this.currentPlayer % this.playerOrder.length]]
  }

  getCurrentPlayerId() {
    if (this.playerOrder.length === 0) return null
    return this.playerOrder[this.currentPlayer % this.playerOrder.length]
  }

  setCurrentPlayer(playerId) {
    const index = this.playerOrder.indexOf(playerId)
    if (index >= 0) this.currentPlayer = index
  }

  nextPlayer() {
    clearTimeout(this.turnTimeout)
    const n = this.playerOrder.length
    if (n === 0 || n === 1) return
    for (let i = 0; i < n; i++) {
      this.currentPlayer = (this.currentPlayer + 1) % n
      if (this.getCurrentPlayer().connected) break   // skip people who dropped
    }
    this.startTurn()
  }

  startTurn() {
    clearTimeout(this.turnTimeout)
    const player = this.getCurrentPlayer()
    if (!player || this.unflipped.length === 0) return
    this.sendRoomMessage(`${player.nickname}'s turn!`, 'turn')
    this.turnTimeout = setTimeout(() => {
      const slow = this.getCurrentPlayer()
      if (slow) this.sendRoomMessage(`${slow.nickname} took too long to go! Who's next?`, 'turn')
      this.nextPlayer()
    }, Constants.GAME.TURN_TIMEOUT)
  }

  getRoomData() {
    return {
      roomName: this.bots.length ? "Game vs bots" : this.privateRoom ? "Private Game" : "Public Game",
      roomId: this.id,
      unflippedCount: this.unflipped.length,
      flipped: this.flipped,
      players: this.playerOrder.map((id) => this.players[id].getPlayerData()),
      currentPlayer: this.getCurrentPlayerId(),
      privateRoom: this.privateRoom,
      pausedPlayer: this.pausedPlayer,
      paused: this.paused,
      hasBots: this.bots.length > 0,
      fillInMs: this.fillInMs()
    }
  }

  // Public games wait for real people; bots only fill in if nobody shows up in time
  isWaiting() { return !this.privateRoom && this.playerOrder.length < 2 }
  fillInMs() {
    if (this.privateRoom || this.humanCount() >= TARGET_PLAYERS || this.bots.length > 0) return null
    return Math.max(0, FILL_AFTER_MS - (Date.now() - this.lastHumanJoinAt))
  }

  matchmake() {
    if (this.privateRoom) return
    const humans = this.humanCount()
    if (humans === 0) return
    const fillBots = this.bots.filter((b) => b.fill)
    if (humans + this.bots.length > TARGET_PLAYERS && fillBots.length) {   // enough real players now: send a bot home
      const gone = fillBots[0]
      const name = this.players[gone.id] && this.players[gone.id].nickname
      this.bots = this.bots.filter((b) => b !== gone)
      this.removePlayerFully(gone.id, `${name} left: enough real players have joined!`)
      if (!this.bots.length) { clearInterval(this.botInterval); this.botInterval = null }
      return
    }
    if (humans < TARGET_PLAYERS && humans + this.bots.length < TARGET_PLAYERS && Date.now() - this.lastHumanJoinAt >= FILL_AFTER_MS) {
      this.addBots(TARGET_PLAYERS - humans - this.bots.length, 'easy', true)
      this.sendRoomMessage('Not enough players yet, so some bots joined. Real players can join any time!', 'info')
      this.update()
    }
  }

  getSocket(playerId) { return this.players[playerId]?.socket }

  update() {
    if (this.humanCount() > 0)
      this.io.in(this.id).emit(Constants.MSG_TYPES.GAME_UPDATE, this.getRoomData())
  }

  emitWordEvent(data) { this.io.in(this.id).emit(Constants.MSG_TYPES.WORD_EVENT, data) }

  flipTile(data) {
    const newLetter = this.unflipped.pop()
    if (!newLetter) return
    this.flipped.push(newLetter);
    this.sendRoomMessage(`${data.player} flipped the letter ${newLetter}`, 'flip')
    if (this.unflipped.length === 0)
      this.sendRoomMessage(`That's the last letter! If nobody can make or steal anything more, everyone press "Finished".`, 'info')
    this.nextPlayer()
  }

  overrideWord(data, word) {
    if (this.privateRoom) {
      this.overrides.add(word.toLowerCase())
      this.sendRoomMessage(`${this.players[data.playerId].nickname} added "${word}" to the dictionary!`)
    }
  }

  takeFromCenter(letterIndex) {
    this.flipped = this.flipped.filter((_, index) => letterIndex[index] === undefined)
  }

  isValidWord(data, word, stealing = false) {
    word = word.toLowerCase()
    const who = this.players[data.playerId]
    if (!this.privateRoom && isBlocked(word)) {                     // never show a slur to a public room
      this.sendPrivateMessage(who.socket, "That word isn't allowed in public games.")
      return false
    }
    if (word.length < 3 && !this.overrides.has(word)) {
      this.sendPrivateMessage(who.socket, 'Your word needs to be real and at least 3 characters long!')
      this.reportAttempt('invalid', data, word, stealing)
      return false
    }
    if (isWord(word) || this.overrides.has(word)) return true
    this.reportAttempt('invalid', data, word, stealing)
    return false
  }

  createWord(data, word, stealing = false) {
    if (!stealing && !this.isValidWord(data, word, stealing)) { return }
    const letterIndex = helpers.checkCenterForWord(word, this.flipped);
    const player = this.players[data.playerId]
    if (letterIndex !== false && !stealing) {
      player.addWord(word)
      player.lastWordAt = Date.now()
      this.takeFromCenter(letterIndex)
      this.sendRoomMessage(`${player.nickname} made the word: ${word.toUpperCase()}`, 'word')
      this.emitWordEvent({ kind: 'create', player: player.nickname, playerId: player.id, word: word.toUpperCase() })
      this.setCurrentPlayer(data.playerId)
      return true;
    } else if (letterIndex !== false) {
      this.takeFromCenter(letterIndex)
      return true;
    } else {
      if (!stealing) this.reportAttempt('miss', data, word, false)
      return false;
    }
  }

  stealWord(data, victim, oldWord, newWord) {
    const thief = this.players[data.playerId]
    if (typeof(oldWord) !== 'string' || typeof(newWord) !== 'string') return
    oldWord = oldWord.toUpperCase()
    newWord = newWord.toUpperCase()
    const difference = helpers.checkWordContainsOther(helpers.letterCountMap(newWord), helpers.letterCountMap(oldWord))
    if (!this.players[victim] || !this.players[victim].hasWord(oldWord))
      return this.sendPrivateMessage(thief.socket, `Seems like someone must have taken that word before you!`)
    if (!difference || !this.isValidWord(data, newWord, true))
      return difference ? undefined : this.reportAttempt('miss', data, newWord, true, oldWord);
    if (victim !== data.playerId && sameRoot(oldWord, newWord))
      return this.sendPrivateMessage(thief.socket, `You can't steal ${oldWord} with ${newWord}: it's the same root word. Make a different word!`)
    if (this.createWord(data, helpers.letterMapToWord(difference), true)) {
      const own = victim === data.playerId
      thief.addWord(newWord);
      thief.lastWordAt = Date.now()
      this.players[victim].removeWord(oldWord);
      this.setCurrentPlayer(data.playerId)
      this.emitWordEvent({ kind: own ? 'extend' : 'steal', player: thief.nickname, playerId: thief.id, victim: this.players[victim].nickname, old: oldWord, word: newWord })
      return this.sendRoomMessage(own
        ? `${thief.nickname} extended ${oldWord} into ${newWord}!`
        : `${thief.nickname} stole ${oldWord} from ${this.players[victim].nickname} and made ${newWord}!!!`, 'word')
    }
    this.reportAttempt('miss', data, newWord, true, oldWord);
  }

  // Failed attempts are shown to everyone (cute, not mean): chat line + a wobbling-tiles call-out
  reportAttempt(kind, data, word, stealing, old) {
    const nick = this.players[data.playerId].nickname, W = word.toUpperCase()
    const text = kind === 'invalid'
      ? OOPS[Math.floor(Math.random() * OOPS.length)](nick, W)
      : stealing ? `${nick} tried to steal ${old} with ${W}, but the letters don't add up 🫠`
                 : `${nick} spotted ${W}, but those letters aren't in the middle 👀`
    this.sendRoomMessage(text, 'oops')
    this.emitWordEvent({ kind, player: nick, playerId: data.playerId, word: W, old, stealing: !!stealing })
  }

  putBackWord(data, word) {
    const player = this.players[data.playerId]
    word = word.toUpperCase()
    if (player.hasWord(word)) {
      player.removeWord(word)
      this.sendRoomMessage(`${player.nickname} put ${word} back into the mix!`)
      this.flipped = this.flipped.concat([...word])
    } else {
      this.sendPrivateMessage(player.socket, `Failed to put back word ${word}! Are you sure that's not someone elses?`);
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
    const done = this.playerOrder.filter((id) => this.players[id].isDone).length
    this.sendRoomMessage(`${this.players[data.playerId].nickname} is done! ${done}/${this.playerOrder.length} players done.`)
    this.endGame();
  }

  endGame() {
    if (this.playerOrder.length === 0) return
    const standings = []
    for (const id of this.playerOrder) {
      const p = this.players[id]
      if (!p.isDone) return
      standings.push({ nickname: p.nickname, score: p.score, words: p.words, bot: p.bot })
    }
    standings.sort((a, b) => b.score - a.score)
    const topScore = standings[0].score
    const winners = standings.filter((s) => s.score === topScore).map((s) => s.nickname)
    this.sendRoomMessage(winners.length === 1
      ? `${winners[0]} has won with ${topScore} points!`
      : `${winners.join(' and ')} tied for first with ${topScore} points!`, 'info')
    this.io.in(this.id).emit(Constants.MSG_TYPES.GAME_OVER, { winners, topScore, standings })
    if (this.hooks.onGameEnd) this.hooks.onGameEnd(this)
    this.resetGame()
  }

  // Ends a "someone is typing a word" pause. If it didn't produce a word, the player can't pause again for a bit,
  // so nobody can keep everyone else locked out by opening and cancelling the dialog.
  unpauseGame(playerId) {
    if (playerId !== this.pausedPlayer) return
    clearTimeout(this.pausedTimeout)
    const p = this.players[playerId]
    if (p && !p.bot) {
      if (p.lastWordAt >= this.pausedAt) this.lockStreak = { id: null, count: 0 }
      else p.lockCooldownUntil = Date.now() + LOCK_COOLDOWN_MS
    }
    this.pausedPlayer = null;
    this.paused = false;
  }

  pauseGame(playerId) {
    if (this.paused) return
    const p = this.players[playerId]
    if (!p) return
    const now = Date.now()
    if (!p.bot) {
      if (this.flipped.length === 0)
        return this.sendPrivateMessage(p.socket, 'There is nothing in the middle to make a word from yet!')
      if (p.lockCooldownUntil > now)
        return this.sendPrivateMessage(p.socket, `Wait ${Math.ceil((p.lockCooldownUntil - now) / 1000)}s before pausing the game again.`)
    }
    this.paused = true
    this.pausedPlayer = playerId
    this.pausedAt = now
    this.lockStreak = this.lockStreak.id === playerId ? { id: playerId, count: this.lockStreak.count + 1 } : { id: playerId, count: 1 }
    if (this.lockStreak.count >= 2 && this.humanCount() > 1)
      this.sendRoomMessage(`${p.nickname} is holding the pause again…`)
    this.pausedTimeout = setTimeout(() => this.unpauseGame(playerId), Constants.GAME.PAUSED_TIMEOUT)
  }

  hasMove(playerId) { return playerId === this.pausedPlayer }

  // Lets a bot act with the same permissions a human has while typing a word
  runAs(playerId, command, args) {
    const p = this.players[playerId]
    if (!p) return
    const prev = this.pausedPlayer
    this.pausedPlayer = playerId
    try { this.handlePlayerCommand({ player: p.nickname, playerId }, command, args) }
    finally { this.pausedPlayer = this.paused ? prev : null }
  }

  handlePlayerCommand(data, command, args) {
    if (!this.players[data.playerId]) return
    args = Array.isArray(args) ? args : []
    const wordArg = (v) => (typeof v === 'string' && WORD_RE.test(v)) ? v : null
    const me = () => this.getSocket(data.playerId)
    switch(command) {
      case Constants.COMMANDS.FLIP:
        if (this.isWaiting()) { this.sendPrivateMessage(me(), 'Waiting for more players to join…'); break; }
        if (this.getCurrentPlayerId() === data.playerId) this.flipTile(data);
        break;
      case Constants.COMMANDS.CREATE_WORD:
        if (!this.hasMove(data.playerId)) break;
        if (!wordArg(args[0])) { this.sendPrivateMessage(me(), 'Words may only contain letters (max 30).'); break; }
        this.createWord(data, args[0]);
        break;
      case Constants.COMMANDS.STEAL_WORD:
        if (!args[0] || typeof args[0] !== 'object' || !this.hasMove(data.playerId)) break;
        if (typeof args[0].playerId !== 'string' || !wordArg(args[0].word) || !wordArg(args[1])) break;
        this.stealWord(data, args[0].playerId, args[0].word, args[1]);
        break;
      case Constants.COMMANDS.RETURN:
        if (!wordArg(args[0])) break;
        this.putBackWord(data, args[0])
        break;
      case Constants.COMMANDS.OVERRIDE:
        if (this.privateRoom && wordArg(args[0])) this.overrideWord(data, args[0])
        else this.sendPrivateMessage(me(), `You can't use that command in a public room!`)
        break;
      case Constants.COMMANDS.RESET:
        if (this.privateRoom) this.resetGame()
        else this.sendPrivateMessage(me(), `You can't use that command in a public room!`)
        break;
      case Constants.COMMANDS.DONE:
        if (!this.players[data.playerId].isDone) this.playerIsDone(data);
        break;
      case Constants.COMMANDS.RULES:
        this.sendPrivateMessage(me(), Constants.SERVER_PROMPTS.RULES);
        break;
      case Constants.COMMANDS.PAUSE_GAME:
        this.pauseGame(data.playerId)
        break;
      case Constants.COMMANDS.UNPAUSE_GAME:
        this.unpauseGame(data.playerId)
        break;
      default:
        this.sendPrivateMessage(me(), `Command not found!`);
    }
    this.update();
  }

  sendPrivateMessage(socket, message) {
    if (!socket) return
    socket.emit(Constants.MSG_TYPES.MESSAGE, {
      type: Constants.CHAT_MSG_TYPES.SERVER_MESSAGE,
      typeModifier: Constants.CHAT_MSG_TYPES.MODIFIERS.PRIVATE,
      message: message
    })
  }

  sendRoomMessage(message, kind = 'info') {
    this.sendMessage({ type: Constants.CHAT_MSG_TYPES.SERVER_MESSAGE, kind, message })
  }

  sendMessage(data) {
    switch (data.type) {
      case Constants.CHAT_MSG_TYPES.SERVER_MESSAGE:
      case Constants.CHAT_MSG_TYPES.PLAYER_MESSAGE:
        return this.io.in(this.id).emit(Constants.MSG_TYPES.MESSAGE, data)
      default:
        return
    }
  }

  // ---- membership -------------------------------------------------------------------------------

  addPlayer(socket, nickname, key) {
    this.lastHumanJoinAt = Date.now()
    const player = new Player(socket, this.uniqueName(nickname), this.id)
    player.key = key || null
    this.players[socket.id] = player
    this.playerOrder.push(socket.id);
    this.sendRoomMessage(`${player.nickname} has joined the room!`, 'join')
    return player
  }

  addBots(count, difficulty, fill = false) {
    if (!DIFFICULTIES.includes(difficulty)) difficulty = 'medium'
    const names = helpers.shuffle([...BOT_NAMES])
    for (let i = 0; i < count; i++) {
      const id = `bot-${crypto.randomBytes(6).toString('hex')}`
      const bot = new Player({ id, emit() {} }, this.uniqueName(names[i]), this.id)
      bot.bot = true
      this.players[id] = bot
      this.playerOrder.push(id)
      const brain = new Bot(this, id, difficulty)
      brain.fill = fill
      this.bots.push(brain)
    }
    if (!this.botInterval) this.botInterval = setInterval(() => this.bots.forEach((b) => { try { b.tick() } catch (e) { logger.error(`Bot error: ${e.stack}`) } }), 700)
  }

  markDisconnected(id) {
    const p = this.players[id]
    if (!p || p.bot) return
    p.connected = false
    if (this.pausedPlayer === id) this.unpauseGame(id)
    this.sendRoomMessage(`${p.nickname} lost connection...`, 'leave')
    if (this.getCurrentPlayerId() === id) this.nextPlayer()
  }

  // A reconnecting browser has a new socket id: move the player's seat over to it
  rekeyPlayer(oldId, socket) {
    const p = this.players[oldId]
    if (!p) return null
    delete this.players[oldId]
    p.id = socket.id
    p.socket = socket
    p.connected = true
    this.players[socket.id] = p
    this.playerOrder[this.playerOrder.indexOf(oldId)] = socket.id
    this.sendRoomMessage(`${p.nickname} is back!`, 'join')
    return p
  }

  // Leaving for good (clicked leave, or never came back): their letters return to the middle
  removePlayerFully(id, customMessage) {
    const p = this.players[id]
    if (!p) return false
    const idx = this.playerOrder.indexOf(id)
    const hadWords = p.words.length > 0
    if (hadWords) this.flipped = this.flipped.concat([...p.words.join('')])
    this.playerOrder.splice(idx, 1)
    delete this.players[id]
    if (this.pausedPlayer === id) this.unpauseGame(id)
    const n = this.playerOrder.length
    if (n > 0) {
      const wasCurrent = idx === this.currentPlayer
      if (idx < this.currentPlayer) this.currentPlayer--
      this.currentPlayer %= n
      if (wasCurrent) this.startTurn()
    }
    this.sendRoomMessage(customMessage || `${p.nickname} left the game${hadWords ? ' (their letters went back to the middle)' : ''}.`, 'leave')
    if (this.humanCount() > 0) this.endGame()
    return true
  }
}

export default Room;
