// Tiny synthesized sound effects (WebAudio): nothing to download.
const KEY = 'scuffle.sound';
let enabled = (() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })();
let ctx = null;

const audio = () => {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

function tone(freq, start, dur, { type = 'sine', vol = 0.12, slideTo } = {}) {
  const c = audio(); if (!c) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
}

const SOUNDS = {
  flip:   () => { tone(620, 0, 0.07, { type: 'triangle', slideTo: 380, vol: 0.14 }); },
  turn:   () => { tone(880, 0, 0.12, { vol: 0.1 }); tone(1320, 0.09, 0.14, { vol: 0.08 }); },
  word:   () => { [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.22, { vol: 0.12 })); },
  extend: () => { [587, 740, 880].forEach((f, i) => tone(f, i * 0.07, 0.2, { vol: 0.12 })); },
  steal:  () => { tone(330, 0, 0.14, { type: 'sawtooth', vol: 0.07 }); tone(247, 0.1, 0.18, { type: 'sawtooth', vol: 0.07 }); tone(659, 0.22, 0.25, { vol: 0.12 }); },
  error:  () => { tone(160, 0, 0.16, { type: 'square', vol: 0.06 }); },
  win:    () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, { vol: 0.13 })); },
  click:  () => { tone(500, 0, 0.04, { type: 'triangle', vol: 0.07 }); },
};

export const isSoundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  if (on) SOUNDS.click();
}
export const play = (name) => { if (enabled && SOUNDS[name]) { try { SOUNDS[name]() } catch { /* audio blocked */ } } };
