import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
let proc;

const connect = () => new Promise((resolve) => {
  const s = io(URL, { transports: ['websocket'], reconnection: false });
  s.on('connect', () => resolve(s));
});
const once = (s, ev, pred = () => true) => new Promise((resolve) => {
  const h = (d) => { if (pred(d)) { s.off(ev, h); resolve(d) } };
  s.on(ev, h);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  proc = spawn('node', ['server/index.js'], { env: { ...process.env, PORT, NODE_ENV: 'production', FILL_AFTER_MS: '1500' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${URL}/healthz`)).ok) return } catch {} await sleep(100) }
  throw new Error('server did not start');
});
after(() => proc.kill());

test('two players join a private room and flip a tile', async () => {
  const a = await connect(), b = await connect();
  a.emit('join_room', { nickname: 'Alice', isPrivate: true });
  const first = await once(a, 'update');
  assert.equal(first.players.length, 1);
  b.emit('join_room', { nickname: 'Bob', room: first.roomId, isPrivate: true });
  await once(b, 'update', (d) => d.players.length === 2);
  const turn = first.currentPlayer === a.id ? a : b;
  turn.emit('player_action', { command: 'FLIP' });
  const after = await once(a, 'update', (d) => d.flipped.length === 1);
  assert.equal(after.flipped.length, 1);
  a.close(); b.close();
});

test('malformed payloads do not crash the server', async () => {
  const s = await connect();
  for (const bad of [null, 1, 'x', {}, { nickname: {} }, { nickname: 'x', room: '__proto__', isPrivate: true }, { nickname: 'x', room: 'constructor', isPrivate: true }]) s.emit('join_room', bad);
  s.emit('message', 'hello before joining');
  s.emit('player_action', { command: 'CREATE_WORD' });
  s.emit('player_action', { command: 'STEAL_WORD', args: [null] });
  s.emit('player_action', { command: 'nope' });
  s.emit('message', { a: 1 });
  await sleep(300);
  assert.equal((await fetch(`${URL}/healthz`)).status, 200);
  s.close();
});

test('rejects joining a private room as public, and unknown rooms', async () => {
  const a = await connect();
  a.emit('join_room', { nickname: 'Host', isPrivate: true });
  const { roomId } = await once(a, 'update');
  const b = await connect();
  b.emit('join_room', { nickname: 'Sneak', room: roomId, isPrivate: false });
  const err = await once(b, 'ERROR');
  assert.equal(err.exit, true);
  const c = await connect();
  c.emit('join_room', { nickname: 'Ghost', room: 'a'.repeat(40), isPrivate: true });
  await once(c, 'ERROR');
  a.close(); b.close(); c.close();
});

test('rate limiting drops floods but keeps the server healthy', async () => {
  const s = await connect();
  s.emit('join_room', { nickname: 'Flood', isPrivate: true });
  await once(s, 'update');
  for (let i = 0; i < 500; i++) s.emit('message', 'spam ' + i);
  await sleep(300);
  assert.equal((await fetch(`${URL}/healthz`)).status, 200);
  s.close();
});

test('security headers present', async () => {
  const r = await fetch(`${URL}/`);
  assert.ok(r.headers.get('x-content-type-options'));
  assert.equal(r.headers.get('x-powered-by'), null);
});

const KEY = () => 'a1b2c3d4-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

test('a bot opponent flips letters and makes words on its own', async () => {
  const s = await connect();
  s.emit('join_room', { nickname: 'Solo', bots: 1, difficulty: 'hard' });
  const first = await once(s, 'update');
  assert.equal(first.hasBots, true);
  assert.equal(first.players.length, 2);
  assert.ok(first.players.some((p) => p.bot));
  // human flips; turn passes to the bot, which should flip back within a few seconds
  s.emit('player_action', { command: 'FLIP' });
  const afterBot = await once(s, 'update', (d) => d.flipped.length >= 2);
  assert.ok(afterBot.flipped.length >= 2);
  // keep flipping on our turns until the bot claims a word (hard bot, bounded wait)
  let botScore = 0;
  const deadline = Date.now() + 60000;
  const onUpdate = (d) => {
    botScore = d.players.find((p) => p.bot).score;
    if (d.currentPlayer === s.id && d.unflippedCount > 0) s.emit('player_action', { command: 'FLIP' });
  };
  s.on('update', onUpdate);
  while (botScore === 0 && Date.now() < deadline) await sleep(500);
  s.off('update', onUpdate);
  assert.ok(botScore > 0, 'bot should have scored within 60s');
  s.close();
});

test('losing connection keeps your seat; reconnecting with the same key resumes it', async () => {
  const key = KEY();
  const a = await connect();
  a.emit('join_room', { nickname: 'Dropper', isPrivate: true, key });
  const { roomId } = await once(a, 'update');
  const b = await connect();
  b.emit('join_room', { nickname: 'Stayer', room: roomId, isPrivate: true, key: KEY() });
  await once(b, 'update', (d) => d.players.length === 2);
  a.close(); // abrupt drop
  const dropped = await once(b, 'update', (d) => d.players.some((p) => p.nickname === 'Dropper' && !p.connected));
  assert.equal(dropped.players.length, 2);
  const a2 = await connect();
  a2.emit('join_room', { nickname: 'Dropper', room: roomId, isPrivate: true, key });
  const back = await once(a2, 'update', (d) => d.players.length === 2 && d.players.every((p) => p.connected));
  assert.ok(back.players.some((p) => p.playerId === a2.id), 'seat moved to the new socket id');
  a2.close(); b.close();
});

test('explicitly leaving removes you right away and closes empty rooms', async () => {
  const a = await connect(), b = await connect();
  a.emit('join_room', { nickname: 'Leaver', isPrivate: true, key: KEY() });
  const { roomId } = await once(a, 'update');
  b.emit('join_room', { nickname: 'Remainer', room: roomId, isPrivate: true, key: KEY() });
  await once(b, 'update', (d) => d.players.length === 2);
  a.emit('leave_room');
  const after = await once(b, 'update', (d) => d.players.length === 1);
  assert.equal(after.players[0].nickname, 'Remainer');
  const before = (await (await fetch(`${URL}/api/stats`)).json()).rooms;
  b.emit('leave_room');
  await sleep(400);
  const now = (await (await fetch(`${URL}/api/stats`)).json()).rooms;
  assert.ok(now < before, 'room closed when the last human left');
  a.close(); b.close();
});

test('opening and cancelling the word lock repeatedly is blocked by a cooldown', async () => {
  const s = await connect();
  s.emit('join_room', { nickname: 'Spammer', isPrivate: true, key: KEY() });
  await once(s, 'update');
  s.emit('player_action', { command: 'PAUSE_GAME' });          // nothing flipped yet: refused
  assert.match((await once(s, 'message', (m) => m.typeModifier === 'private')).message, /nothing in the middle/i);
  s.emit('player_action', { command: 'FLIP' });
  await once(s, 'update', (d) => d.flipped.length === 1);
  s.emit('player_action', { command: 'PAUSE_GAME' });
  await once(s, 'update', (d) => d.paused === true);
  s.emit('player_action', { command: 'UNPAUSE_GAME' });        // cancel without making a word
  const cooled = await once(s, 'update', (d) => d.paused === false && d.players[0].lockCooldown > 0);
  assert.ok(cooled.players[0].lockCooldown > 0);
  s.emit('player_action', { command: 'PAUSE_GAME' });           // immediate retry: refused
  assert.match((await once(s, 'message', (m) => m.typeModifier === 'private')).message, /wait \d+s/i);
  s.close();
});

test('same-root steals are rejected', async () => {
  const { sameRoot } = await import('./utils/roots.js');
  assert.ok(sameRoot('cat', 'cats') && sameRoot('walk', 'walked') && sameRoot('make', 'making'));
  assert.ok(!sameRoot('cat', 'cart') && !sameRoot('ant', 'plant') && !sameRoot('tin', 'tiny'));
});

test('public matchmaking: lonely game waits, bots fill in, then make room for real players', async () => {
  const a = await connect();
  a.emit('join_room', { nickname: 'Early', isPrivate: false, key: KEY() });
  const first = await once(a, 'update');
  assert.equal(first.players.length, 1);
  assert.equal(typeof first.fillInMs, 'number');
  a.emit('player_action', { command: 'FLIP' });                   // refused while waiting
  assert.match((await once(a, 'message', (m) => m.typeModifier === 'private')).message, /waiting/i);
  const filled = await once(a, 'update', (d) => d.players.length === 3);
  assert.equal(filled.players.filter((p) => p.bot).length, 2);
  const b = await connect();
  b.emit('join_room', { nickname: 'Late', isPrivate: false, key: KEY() });
  const swapped = await once(a, 'update', (d) => d.players.length === 3 && d.players.filter((p) => !p.bot).length === 2);
  assert.equal(swapped.players.filter((p) => p.bot).length, 1, 'one bot left when a real player joined');
  a.emit('leave_room'); b.emit('leave_room');
  await sleep(300); a.close(); b.close();
});

test('failed words are shown to everyone, and slurs are blocked in public games', async () => {
  const a = await connect();
  a.emit('join_room', { nickname: 'Oops', isPrivate: true, key: KEY() });
  await once(a, 'update');
  a.emit('player_action', { command: 'FLIP' });
  await once(a, 'update', (d) => d.flipped.length === 1);
  a.emit('player_action', { command: 'PAUSE_GAME' });
  await once(a, 'update', (d) => d.paused);
  const ev = once(a, 'word_event', (e) => e.kind === 'invalid');
  a.emit('player_action', { command: 'CREATE_WORD', args: ['zzqxj'] });
  assert.equal((await ev).word, 'ZZQXJ');
  const bad = await connect();
  bad.emit('join_room', { nickname: 'fuck', isPrivate: false, key: KEY() });
  assert.equal((await once(bad, 'ERROR')).exit, true);
  a.close(); bad.close();
});

test('real URLs serve the app, and SEO files exist', async () => {
  const play = await fetch(`${URL}/play?room=abc`);
  assert.equal(play.status, 200);
  assert.match(await play.text(), /<div id="root">/);
  assert.match(await (await fetch(`${URL}/robots.txt`)).text(), /Sitemap:/);
  assert.match(await (await fetch(`${URL}/sitemap.xml`)).text(), /<urlset/);
});
