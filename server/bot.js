import { sameRoot } from './utils/roots.js';
import { letterCounts, findCreatable, findExtensions, rankOf, isBlocked, isWord } from './dictionary.js';

// How a bot "knows" words: a vocabulary of the N most common words (by real usage) it's comfortable with, a skill
// chance for words inside it, and a small chance for rarer ones. Stable per bot (seeded), so a bot doesn't flicker
// between knowing and not knowing a word. `notice` = chance it spots an available word on any given look.
// react = how long it takes to *recognise* a typical word; the rest of a human's time (reaching for the button,
// typing, hesitating, the odd typo) is added on top in delayFor(). type = ms per typed character.
const PROFILES = {
  easy:   { react: [3800, 8500], type: [240, 400], slip: 0.18, typo: 0.07, flip: [2000, 4000], vocab: 2000,  skill: 0.55, tail: 0,    rare: 0,     notice: 0.28, maxLen: 5,  steals: false, stealP: 0,    pick: 'random' },
  medium: { react: [3200, 7000], type: [170, 300], slip: 0.12, typo: 0.04, flip: [1200, 2800], vocab: 6000,  skill: 0.70, tail: 0.02, rare: 0,     notice: 0.30, maxLen: 7,  steals: true,  stealP: 0.07, stealMaxAdd: 2, stealRearrange: false, pick: 'good' },
  hard:   { react: [1500, 4000], type: [110, 200], slip: 0.05, typo: 0.01, flip: [800, 2000],  vocab: 20000, skill: 0.90, tail: 0.04, rare: 0.003, notice: 0.62, maxLen: 12, steals: true,  stealP: 0.14, stealMaxAdd: 3, stealRearrange: true,  pick: 'best' },
};
export const DIFFICULTIES = Object.keys(PROFILES);

const rand = ([a, b]) => a + Math.random() * (b - a);

function hash(str) { // FNV-1a -> [0,1)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export default class Bot {
  constructor(room, id, difficulty = 'medium') {
    this.room = room;
    this.id = id;
    this.profile = PROFILES[difficulty] || PROFILES.medium;
    this.seed = Math.random().toString(36).slice(2, 8);
    this.flipAt = 0;
    this.pending = null;
    this.nextScan = Date.now() + 1500;
    this.idleScans = 0;
    this.penaltyUntil = 0;
  }

  knows = (word) => {
    const { vocab, skill, tail, rare } = this.profile;
    if (isBlocked(word)) return false;
    const r = rankOf(word);
    let p;
    if (r <= vocab) p = skill + (1 - skill) * 0.6 * (1 - r / vocab);   // very common words are nearly certain
    else p = Number.isFinite(r) ? tail : rare;                  // beyond its vocabulary, or never said aloud
    return hash(this.seed + word) < p;
  };

  find() {
    const r = this.room, me = r.players[this.id], prof = this.profile;
    const fc = letterCounts(r.flipped.join(''));
    const cands = [];
    for (const w of findCreatable(fc, 3, prof.maxLen, this.knows)) cands.push({ type: 'create', word: w, gain: w.length });
    const owners = prof.steals && Math.random() < prof.stealP ? Object.values(r.players) : [me];
    for (const owner of owners) {
      for (const old of owner.words.slice(0, 12)) {
        const exts = findExtensions(letterCounts(old), old.length, fc, prof.maxLen, this.knows, 20);
        for (const w of exts) {
          const steal = owner.id !== this.id;
          if (steal && sameRoot(old, w)) continue;   // not allowed: same root word
          if (steal) {                                // stealing is hard to spot: only attempt what this bot could plausibly see
            const added = w.length - old.length, contiguous = w.includes(old.toLowerCase());
            if (added > prof.stealMaxAdd || (!contiguous && !prof.stealRearrange)) continue;
          }
          cands.push({ type: 'steal', victim: owner.id, old, word: w.toUpperCase(), gain: steal ? w.length + old.length : w.length - old.length });
        }
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.gain - a.gain || rankOf(a.word.toLowerCase()) - rankOf(b.word.toLowerCase()));
    if (prof.pick === 'best') return cands[0];
    if (prof.pick === 'good') return cands[Math.floor(Math.random() * Math.ceil(cands.length / 2))];
    return cands[Math.floor(Math.random() * cands.length)];
  }

  // How long a human would take: spot it (quick for short, common words), reach for the button, type it, maybe dither
  delayFor(c) {
    const prof = this.profile, w = c.word.toLowerCase(), r = rankOf(w);
    const ease = r <= 500 ? 0.55 : r <= 3000 ? 0.8 : r <= 10000 ? 1 : r <= 30000 ? 1.3 : 1.7;
    let ms = rand(prof.react) * ease * (1 + Math.max(0, w.length - 3) * 0.1);
    ms += rand([700, 1300]);                          // move to the button, dialog opens
    if (c.type === 'steal') {                          // spotting a steal takes much longer than spotting a word
      const contiguous = w.includes(c.old.toLowerCase());   // SCAT from CAT is easy to see; CART from CAT takes a moment
      ms = ms * 1.5 * (contiguous ? 1 : 1.5) + rand([1000, 3000]) + rand([300, 700]);
    }
    ms += w.length * rand(prof.type);                 // typing
    if (Math.random() < prof.slip) ms += rand([1500, 4000]);   // got distracted / double-checked
    return ms;
  }

  // Occasionally fat-finger it: swap two neighbouring letters (the room shows everyone the "oops")
  typo(word) {
    if (word.length < 4 || Math.random() >= this.profile.typo) return null;
    const i = 1 + Math.floor(Math.random() * (word.length - 2));
    if (word[i] === word[i + 1]) return null;
    const t = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    return isWord(t.toLowerCase()) ? null : t;
  }

  stillValid(c) {
    const r = this.room;
    const fc = letterCounts(r.flipped.join(''));
    const need = c.type === 'create' ? letterCounts(c.word) : null;
    if (c.type === 'create') return need.every((n, k) => n <= fc[k]);
    const victim = r.players[c.victim];
    if (!victim || !victim.hasWord(c.old)) return false;
    const nw = letterCounts(c.word), ow = letterCounts(c.old);
    return nw.every((n, k) => n - ow[k] >= 0 && n - ow[k] <= fc[k]);
  }

  tick() {
    const r = this.room, me = r.players[this.id], now = Date.now();
    if (!me) return;
    if (r.paused && r.pausedPlayer !== this.id) return; // a human is typing a word: stay out of it
    if (now < this.penaltyUntil) return;                // still annoyed about that typo

    if (r.unflipped.length > 0 && r.getCurrentPlayerId() === this.id) {
      if (!this.flipAt) this.flipAt = now + rand(this.profile.flip);
      if (now >= this.flipAt) { this.flipAt = 0; r.runAs(this.id, 'FLIP', []); }
    } else this.flipAt = 0;

    if (me.isDone || r.flipped.length === 0 && r.unflipped.length > 0) return;

    if (!this.pending && now >= this.nextScan) {
      this.nextScan = now + 900 + Math.random() * 700;
      const c = Math.random() < this.profile.notice ? this.find() : null;   // sometimes it just doesn't see it
      if (c) { this.pending = { c, at: now + this.delayFor(c) }; this.idleScans = 0; }
      else if (r.unflipped.length === 0 && ++this.idleScans >= 3) r.runAs(this.id, 'DONE', []);
    }
    if (this.pending && now >= this.pending.at) {
      const { c } = this.pending;
      this.pending = null;
      if (this.stillValid(c)) {
        const oops = this.typo(c.word);
        const word = oops || c.word;
        if (c.type === 'create') r.runAs(this.id, 'CREATE_WORD', [word]);
        else r.runAs(this.id, 'STEAL_WORD', [{ playerId: c.victim, word: c.old }, word]);
        if (oops) this.penaltyUntil = now + rand([3000, 6000]);
      }
    }
  }

  reset() { this.penaltyUntil = 0; this.pending = null; this.flipAt = 0; this.idleScans = 0; }
}
