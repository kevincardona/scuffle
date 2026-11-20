import React, { useEffect, useRef } from 'react';
import Word from '../Word';
import './callout.scss';

// Which letters of `word` are new compared with `old` (so we can highlight what was added)
const newLetterIndexes = (old, word) => {
  const pool = [...old];
  const hi = [];
  [...word].forEach((l, i) => { const j = pool.indexOf(l); if (j >= 0) pool.splice(j, 1); else hi.push(i); });
  return hi;
};

export default function WordCallout({ event, mine, onDone }) {
  const oops = event.kind === 'invalid' || event.kind === 'miss';
  // The parent re-renders constantly (game updates), so keep the latest onDone in a ref and only restart the timer for a new event
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { const t = setTimeout(() => done.current(), oops ? 2000 : 2600); return () => clearTimeout(t); }, [event.id, oops]);
  const { kind, player, victim, old, word } = event;
  const label = kind === 'invalid' ? `${player} tried “${word}”`
    : kind === 'miss' ? `${player} spotted “${word}”`
    : kind === 'create' ? `${player} made a word!`
    : kind === 'extend' ? `${player} grew ${old}!`
    : `${player} stole ${old} from ${victim}!`;
  return (
    <div className={`callout callout--${kind} ${oops ? 'callout--oops' : ''} ${mine ? 'callout--mine' : ''}`} aria-live="polite">
      <div className="callout__card">
        <div className="callout__label">{kind === 'steal' ? '🥷' : kind === 'extend' ? '🌱' : oops ? '🤔' : '⚡'} {label}</div>
        <div className="callout__tiles">
          {[...word].map((l, i) => {
            const hi = old ? newLetterIndexes(old, word).includes(i) : false;
            return <span key={i} className={`callout__tile ${hi ? 'callout__tile--new' : ''}`} style={{ '--i': i }}>{l}</span>;
          })}
        </div>
        {oops && <div className="callout__oops">{kind === 'invalid' ? 'Not a word! 📖' : "Those letters aren't there 👀"}</div>}
      </div>
    </div>
  );
}
