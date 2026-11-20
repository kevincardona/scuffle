# Scuffle

A free multiplayer word game: flip letters one at a time, race to spot words, and steal your friends' words.
Play with up to 6 people online, in a private room, or against bots.

## How to play

1. **Flip** a letter on your turn.
2. **Spot a word** (3+ letters) in the middle? Press *Create word* and type it first.
3. **Grow** one of your words with at least one middle letter (CAT + S = CATS).
4. **Steal** someone's word by rebuilding it with a middle letter (CAT + R = CART). It must be a different word, not just the same root with a new ending.
5. When the middle is empty and nobody can play, everyone presses *Finished*. Most letters wins.

## Development

Node 22+.

```
npm install
npm run dev      # Vite client on :5173, game server on :3001
npm test         # server tests (sockets, bots, matchmaking, reconnects)
npm run build    # client build into build/
npm start        # production server (serves build/)
```

Server: Express + Socket.IO (`server/`). Client: React + Vite (`src/`). Game rules live in `server/room.js`,
bots in `server/bot.js`, the word list and frequency ranking in `server/dictionary.js`.
`GET /api/stats` shows live room/player counts; `GET /healthz` is the health check.

Deploy to a systemd box with `DEPLOY_HOST=user@host ./scripts/deploy.sh` (see the script for details).
