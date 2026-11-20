const KEY = 'scuffle.settings';
export const BOARDS = {
  green:  { label: 'Green',  felt: '#1f4a3d', edge: '#16372e' },
  blue:   { label: 'Blue',   felt: '#1f3d5c', edge: '#162d45' },
  purple: { label: 'Purple', felt: '#3b2a5c', edge: '#2a1d44' },
  wood:   { label: 'Wood',   felt: '#5a3f28', edge: '#42301e' },
  slate:  { label: 'Slate',  felt: '#33383f', edge: '#25292f' },
};
export const TILE_SIZES = [['Small', 0.85], ['Medium', 1], ['Large', 1.25]];
export const BANK_SIZES = [['Small', 0.85], ['Medium', 1], ['Large', 1.3]];
const DEFAULTS = { board: 'green', tile: 1, bank: 1 };

export const getSettings = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } } };
export function applySettings(s = getSettings()) {
  const b = BOARDS[s.board] || BOARDS.green, root = document.documentElement.style;
  root.setProperty('--felt', b.felt); root.setProperty('--felt-edge', b.edge);
  root.setProperty('--tile-scale', s.tile); root.setProperty('--word-scale', s.bank);
}
export function saveSettings(patch) {
  const s = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
  applySettings(s);
  return s;
}
