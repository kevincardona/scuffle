export default Object.freeze({
  COMMANDS: {
    FLIP: 'FLIP',
    CREATE_WORD: 'CREATE_WORD',
    OVERRIDE: 'OVERRIDE',
    RETURN: 'RETURN',
    STEAL_WORD: 'STEAL_WORD',
    RESET: 'RESET',
    DONE: 'DONE',
    RULES: 'RULES',
    PAUSE_GAME: 'PAUSE_GAME',
    UNPAUSE_GAME: 'UNPAUSE_GAME'
  },
  MSG_TYPES: {
    ERROR: 'ERROR',
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    MESSAGE: 'message',
    GAME_UPDATE: 'update',
    PLAYER_ACTION: 'player_action',
    INPUT: 'input',
    DISCONNECT: 'disconnect',
    WORD_EVENT: 'word_event',
    GAME_OVER: 'game_over'
  },
  CHAT_MSG_TYPES: {
    SERVER_MESSAGE: 'server_message',
    PLAYER_MESSAGE: 'player_message',
    MODIFIERS: {
      PRIVATE: 'private'
    }
  },
  GAME: {
    TILE_COUNT: 150,
    TURN_TIMEOUT: 15000,
    PAUSED_TIMEOUT: 10000,
    LETTER_DISTRIBUTION: {
      A: 14,
      B: 5,
      C: 5,
      D: 6,
      E: 18,
      F: 4,
      G: 4,
      H: 3,
      I: 12,
      J: 2,
      K: 2,
      L: 5,
      M: 3,
      N: 8,
      O: 11,
      P: 3,
      Q: 2,
      R: 9,
      S: 6,
      T: 9,
      U: 6,
      V: 3,
      W: 3,
      X: 2,
      Y: 3,
      Z: 2
    }
  },
  SERVER_PROMPTS: {
    RULES:
      `GOAL: finish with the most letters in your words.
        1. On your turn, press FLIP to turn over one letter in the middle (you have 15 seconds).
        2. Spot a word of 3+ letters in the middle? Press CREATE WORD and type it before anyone else. You take those letters and the word is yours.
        3. Make your word longer: use ALL its letters plus at least 1 from the middle to build a different word (CAT + S = CATS).
        4. Steal: click another player's word and rebuild it the same way (CAT + R = CART). It must be a truly different word: no just adding S, ED or ING.
        5. When every letter is flipped and nobody can make or steal anything, everyone presses FINISHED. Most letters wins.
        Chat tips: /return <word> puts one of your words back, /reset restarts (private rooms), /override <word> accepts a word the dictionary missed (private rooms).`,
  },
})