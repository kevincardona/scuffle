import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCreatable, letterCounts, rankOf, isBlocked } from './dictionary.js';
import Bot from './bot.js';

const fc = letterCounts('EATRSNOILDCUPMHG');
const sample = (d) => { const b = new Bot({ players: {} }, 'x', d); return findCreatable(fc, 3, b.profile.maxLen, b.knows, 1000); };
const median = (a) => a.map(rankOf).sort((x, y) => x - y)[Math.floor(a.length / 2)];

test('easy bots only play common words; harder bots reach further', () => {
  const easy = sample('easy'), hard = sample('hard');
  assert.ok(easy.length > 20);
  assert.ok(median(easy) < 3000, `easy median rank ${median(easy)}`);
  assert.ok(easy.every((w) => w.length <= 5));
  assert.ok(median(hard) > median(easy));
});

test('bots never play unranked/obscure words on easy or medium, or profanity ever', () => {
  for (const d of ['easy', 'medium']) assert.ok(sample(d).every((w) => Number.isFinite(rankOf(w))), `${d} played an unranked word`);
  for (const d of ['easy', 'medium', 'hard']) assert.ok(sample(d).every((w) => !isBlocked(w)));
});
