import { stemmer } from 'stemmer';

// "Same root" = the new word is just the old word in a different form (CAT -> CATS, WALK -> WALKED, MAKE -> MAKING).
// Stealing that way isn't allowed: the new word has to be a genuinely different word.
const SUFFIXES = new Set(['s', 'es', 'ed', 'ing', 'ings', 'er', 'ers', 'est', 'ly', 'ness', 'ment', 'ments', 'able', 'ful', 'less', 'ies']);

function onlyAddsSuffix(shorter, longer) {
  if (longer.length <= shorter.length) return false;
  const check = (base) => {
    if (!longer.startsWith(base)) return false;
    const rest = longer.slice(base.length);
    if (SUFFIXES.has(rest)) return true;
    if (rest === 'd' && base.endsWith('e')) return true;                                  // like -> liked
    return rest[0] === base.at(-1) && SUFFIXES.has(rest.slice(1));                          // run -> running
  };
  return check(shorter)
    || (shorter.endsWith('e') && check(shorter.slice(0, -1)))                              // make -> making
    || (shorter.endsWith('y') && check(shorter.slice(0, -1) + 'i'));                       // happy -> happier
}

export function sameRoot(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b || stemmer(a) === stemmer(b)) return true;
  return a.length < b.length ? onlyAddsSuffix(a, b) : onlyAddsSuffix(b, a);
}
