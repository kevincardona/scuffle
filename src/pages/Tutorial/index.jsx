import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Tile from '../../components/Tile';
import Word from '../../components/Word';
import Logo from '../../components/Logo';
import Toggles from '../../components/Toggles';
import WordCallout from '../../components/WordCallout';
import { play } from '../../util/sound';
import './tutorial.scss';

// A scripted mini-game, entirely in the browser: flip, call a word, grow it, steal one.
const STEPS = [
  { id: 'flip1', kind: 'flip', letter: 'C', text: "It's your turn. Flip a letter!", sub: 'Press the blue button.' },
  { id: 'bot1', kind: 'auto', letter: 'A', text: 'Botty flips a letter…', sub: 'Players take turns, and everyone sees every letter.' },
  { id: 'flip2', kind: 'flip', letter: 'T', text: 'Your turn again. Flip!', sub: 'Watch the middle: words can appear any time.' },
  { id: 'create', kind: 'create', accept: ['CAT', 'ACT'], text: 'C… A… T! You spotted a word!', sub: 'Press Create word and type it before anyone else does.', hint: 'Try CAT.' },
  { id: 'bot2', kind: 'auto', letter: 'S', text: 'Botty flips an S…', sub: 'A new letter means new chances.' },
  { id: 'grow', kind: 'word', from: 'mine', accept: ['CATS'], text: 'Grow it! Tap your word and add the S.', sub: 'Use all its letters plus at least one from the middle.', hint: 'CAT + S = ?' },
  { id: 'bot3', kind: 'auto', letter: 'S', text: 'Another S appears…', sub: 'Now for the sneaky part.' },
  { id: 'steal', kind: 'word', from: 'bot', accept: ['NOSE', 'EONS'], text: "Steal! Tap Botty's word ONE and add the S.", sub: 'Rearrange all the letters into a new word. It has to be a different word, not just ONE + an ending.', hint: 'O, N, E + S makes… NOSE!' },
  { id: 'done', kind: 'done' },
];

export default function Tutorial() {
  const [i, setI] = useState(0);
  const [middle, setMiddle] = useState([]);
  const [mine, setMine] = useState([]);
  const [bot, setBot] = useState(['ONE']);
  const [picked, setPicked] = useState(null);   // word being edited: { from, word }
  const [value, setValue] = useState('');
  const [typing, setTyping] = useState(false);  // "Create word" dialog open
  const [shake, setShake] = useState(false);
  const [hint, setHint] = useState('');
  const [callout, setCallout] = useState(null);
  const inputRef = useRef();
  const step = STEPS[i];

  useEffect(() => {
    if (step.kind !== 'auto') return undefined;
    const t = setTimeout(() => { play('flip'); setMiddle((m) => [...m, step.letter]); setI((n) => n + 1); }, 1300);
    return () => clearTimeout(t);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if ((typing || picked) && inputRef.current) inputRef.current.focus(); }, [typing, picked]);

  const advance = () => { setI((n) => n + 1); setHint(''); setValue(''); setTyping(false); setPicked(null); };
  const flip = () => { play('flip'); setMiddle((m) => [...m, step.letter]); advance(); };

  const submit = () => {
    const word = value.trim().toUpperCase();
    if (!step.accept.includes(word)) {
      play('error'); setShake(true); setHint(step.hint); setTimeout(() => setShake(false), 500); return;
    }
    if (step.kind === 'create') {
      play('word'); setMiddle([]); setMine([word]); setCallout({ kind: 'create', player: 'You', word, id: i });
    } else if (step.from === 'mine') {
      play('extend'); setMiddle([]); setMine([word]); setCallout({ kind: 'extend', player: 'You', old: 'CAT', word, id: i });
    } else {
      play('steal'); setMiddle([]); setBot([]); setMine((m) => [...m, word]); setCallout({ kind: 'steal', player: 'You', victim: 'Botty', old: 'ONE', word, id: i });
    }
    advance();
  };

  const pickable = step.kind === 'word' ? step.from : null;
  const showForm = (step.kind === 'create' && typing) || (step.kind === 'word' && picked);
  const total = STEPS.length - 1;

  return (
    <div id="tutorial">
      <header className="tut__top">
        <Link to="/" className="tut__logo"><Logo size="sm" /></Link>
        <span className="tut__title">Learn to play</span>
        <Toggles />
        <Link to="/play" className="btn btn--small btn--ghost">Skip</Link>
      </header>

      <div className="tut__progress" aria-label={`Step ${Math.min(i + 1, total)} of ${total}`}>
        {Array.from({ length: total }, (_, n) => <i key={n} className={n < i ? 'done' : n === i ? 'now' : ''} />)}
      </div>

      {step.kind !== 'done' ? (
        <>
          <div className="tut__banner"><strong>{step.text}</strong><span>{step.sub}</span></div>
          <div className="tut__table">
            <div className="tut__letters">
              {middle.length === 0 ? <p className="tut__empty">The middle is empty.</p> : middle.map((l, n) => <Tile key={n + l} letter={l} />)}
            </div>
            {callout && <WordCallout key={callout.id} event={callout} mine onDone={() => setCallout(null)} />}
          </div>

          <div className="tut__players">
            <div className="tut__player tut__player--me"><b>You</b>
              <div className="tut__words">
                {mine.length === 0 ? <small>no words yet</small> : mine.map((w) => (
                  <Word key={w} word={w} size="xs" className={pickable === 'mine' ? 'tut__pulse' : ''}
                    onClick={pickable === 'mine' ? () => { setPicked({ from: 'mine', word: w }); setHint(''); } : undefined} />))}
              </div>
            </div>
            <div className="tut__player"><b>🤖 Botty</b>
              <div className="tut__words">
                {bot.length === 0 ? <small>no words yet</small> : bot.map((w) => (
                  <Word key={w} word={w} size="xs" className={pickable === 'bot' ? 'tut__pulse' : ''}
                    onClick={pickable === 'bot' ? () => { setPicked({ from: 'bot', word: w }); setHint(''); } : undefined} />))}
              </div>
            </div>
          </div>

          {showForm && (
            <form className={`tut__form ${shake ? 'tut__form--shake' : ''}`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <label>{step.kind === 'create' ? 'Type a word from the middle' : `Make a new word from ${picked.word} + the middle`}</label>
              <div className="tut__row">
                <input ref={inputRef} className="input" value={value} maxLength={12} autoComplete="off" spellCheck={false} placeholder="TYPE HERE"
                  onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())} />
                <button className="btn btn--green" type="submit" disabled={value.length < 3}>Go</button>
              </div>
              {hint && <p className="tut__hint">💡 {hint}</p>}
            </form>
          )}

          <div className="tut__actions">
            {step.kind === 'flip' && <button className="btn btn--lg btn--block tut__flip" onClick={flip}>Flip a letter</button>}
            {step.kind === 'create' && !typing && <button className="btn btn--lg btn--green btn--block tut__flip" onClick={() => setTyping(true)}>Create word</button>}
            {step.kind === 'auto' && <button className="btn btn--lg btn--block" disabled>Waiting for Botty…</button>}
            {step.kind === 'word' && !picked && <button className="btn btn--lg btn--ghost btn--block" disabled>Tap the glowing word above</button>}
          </div>
        </>
      ) : (
        <div className="tut__done">
          <div className="tut__trophy">🎉</div>
          <h1>That's Scuffle!</h1>
          <p>Flip letters, call out words, grow them, and steal. The real game is faster, and more chaotic.</p>
          <div className="tut__cta">
            <Link to="/play" className="btn btn--lg">Play now</Link>
            <button className="btn btn--lg btn--ghost" onClick={() => { setI(0); setMiddle([]); setMine([]); setBot(['ONE']); setHint(''); }}>Replay</button>
          </div>
        </div>
      )}
    </div>
  );
}
