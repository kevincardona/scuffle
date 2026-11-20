import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Loaded once at startup (the old code re-read a 2.8 MB file and built a regex per word check).
const require = createRequire(import.meta.url);
const file = path.join(path.dirname(require.resolve('check-word/package.json')), 'words', 'en.txt');
const list = fs.readFileSync(file, 'utf8').split('\n').map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{3,30}$/.test(w));
const set = new Set(list);
const N = list.length;

export const isWord = (w) => set.has(String(w).toLowerCase());

// Packed per-word letter counts so bots can test "can I build this from these letters" quickly.
const lens = new Uint8Array(N);
const counts = new Uint8Array(N * 26);
for (let i = 0; i < N; i++) {
  const w = list[i];
  lens[i] = w.length;
  for (let k = 0; k < w.length; k++) counts[i * 26 + w.charCodeAt(k) - 97]++;
}

export function letterCounts(str) {
  const c = new Uint8Array(26);
  for (const ch of String(str).toLowerCase()) {
    const k = ch.charCodeAt(0) - 97;
    if (k >= 0 && k < 26) c[k]++;
  }
  return c;
}

// Words buildable entirely from the centre letters `fc`. Starts at a random offset so results aren't alphabetically biased.
export function findCreatable(fc, minLen, maxLen, accept, cap = 300) {
  const out = [];
  const start = Math.floor(Math.random() * N);
  for (let n = 0; n < N; n++) {
    const i = (start + n) % N;
    const L = lens[i];
    if (L < minLen || L > maxLen) continue;
    const o = i * 26;
    let ok = true;
    for (let k = 0; k < 26; k++) if (counts[o + k] > fc[k]) { ok = false; break; }
    if (ok && accept(list[i])) { out.push(list[i]); if (out.length >= cap) break; }
  }
  return out;
}

// Longer words containing all of `wc` plus >= 1 centre letter (used for both extending and stealing).
export function findExtensions(wc, wlen, fc, maxLen, accept, cap = 100) {
  const out = [];
  const start = Math.floor(Math.random() * N);
  for (let n = 0; n < N; n++) {
    const i = (start + n) % N;
    const L = lens[i];
    if (L <= wlen || L > maxLen) continue;
    const o = i * 26;
    let ok = true;
    for (let k = 0; k < 26; k++) {
      const d = counts[o + k] - wc[k];
      if (d < 0 || d > fc[k]) { ok = false; break; }
    }
    if (ok && accept(list[i])) { out.push(list[i]); if (out.length >= cap) break; }
  }
  return out;
}

// ---- how common is each word? (SUBTLEX-US: ranked by real usage in spoken English) --------------------
const rankMap = new Map();
(require('subtlex-word-frequencies')).forEach((entry, i) => {
  const w = String(entry.word).toLowerCase();
  if (set.has(w) && !rankMap.has(w)) rankMap.set(w, i + 1);   // list is sorted by frequency; first hit wins
});
export const rankOf = (w) => rankMap.get(w) ?? Infinity;      // Infinity = not a word people actually say

// Words bots never play (so a family game never gets a bot shouting slurs)
const leo = require('leo-profanity');
const blocked = new Set(leo.list().map((w) => String(w).toLowerCase()));
export const isBlocked = (w) => blocked.has(w) || leo.check(w);
export const hasProfanity = (text) => leo.check(String(text));
export const censor = (text) => leo.clean(String(text));

export const dictionarySize = N;
