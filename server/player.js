class Player {
  constructor(socket, nickname, room) {
    this.id = socket.id
    this.socket = socket
    this.nickname = nickname
    this.room = room
    this.words = []
    this.score = 0
    this.active = true
    this.isDone = false
    this.bot = false
    this.connected = true
    this.key = null
    this.lockCooldownUntil = 0
    this.lastWordAt = 0
  }

  getPlayerData() {
    return {
      nickname: this.nickname,
      playerId: this.id,
      words: this.words,
      score: this.score,
      active: this.active,
      bot: this.bot,
      connected: this.connected,
      lockCooldown: Math.max(0, Math.ceil((this.lockCooldownUntil - Date.now()) / 1000)),
    }
  }

  addWord(word) {
    this.words.push(word.toUpperCase());
    this.score += word.length
  }

  removeWord(word) {
    const i = this.words.indexOf(word)
    if (i < 0) return
    this.words.splice(i, 1)
    this.score -= word.length
  }

  hasWord(word) {
    return this.words.includes(word);
  }
}

export default Player
