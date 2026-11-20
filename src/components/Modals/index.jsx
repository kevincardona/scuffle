import React, { useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import Word from '../Word';
import Rules from '../Rules';
import Constants from '../../constants';

import { BOARDS, TILE_SIZES, BANK_SIZES, getSettings, saveSettings } from '../../util/settings';

export function SettingsModal({ onClose }) {
  const [s, setS] = useState(getSettings());
  const set = (patch) => setS(saveSettings(patch));
  const seg = (list, key) => (
    <div className="seg">{list.map(([label, v]) => <button key={label} aria-pressed={s[key] === v} onClick={() => set({ [key]: v })}>{label}</button>)}</div>
  );
  return (
    <Modal title="Make it yours" icon="🎨" onClose={onClose} actions={<button className="btn btn--block" onClick={onClose}>Done</button>}>
      <div className="settings">
        <div className="settings__row"><span>Board</span>
          <div className="swatches">{Object.entries(BOARDS).map(([k, b]) => (
            <button key={k} title={b.label} aria-label={b.label} aria-pressed={s.board === k} style={{ background: b.felt, borderColor: b.edge }} onClick={() => set({ board: k })} />
          ))}</div>
        </div>
        <div className="settings__row"><span>Board letters</span>{seg(TILE_SIZES, 'tile')}</div>
        <div className="settings__row"><span>Players' words</span>{seg(BANK_SIZES, 'bank')}</div>
        <p className="hint">Tip: drag the edges of the players panel to resize it.</p>
      </div>
    </Modal>
  );
}

export function HelpModal({ onClose }) {
  const [tab, setTab] = useState('rules');
  return (
    <Modal title="How to play" icon="🎮" wide onClose={onClose}
      actions={<button className="btn btn--block" onClick={onClose}>Got it</button>}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'rules'} onClick={() => setTab('rules')}>Rules</button>
        <button role="tab" aria-selected={tab === 'commands'} onClick={() => setTab('commands')}>Chat commands</button>
      </div>
      <div style={{ marginTop: '0.9rem' }}>
        {tab === 'rules' ? <Rules compact /> : (
          <div className="cmd-list">
            <div><code>/rules</code><span>Show the rules in chat (only you see it)</span></div>
            <div><code>/return word</code><span>Put one of your words back in the middle</span></div>
            <div><code>/reset</code><span>Restart the game (private rooms)</span></div>
            <div><code>/override word</code><span>Accept a word the dictionary missed (private rooms)</span></div>
            <p className="hint">Shortcuts: <b>Space</b> flips on your turn, <b>C</b> creates a word.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function InviteModal({ link, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* select manually */ }
  };
  return (
    <Modal title="Invite friends" icon="💌" onClose={onClose}>
      <p className="hint">Send this link. Anyone who opens it joins your game.</p>
      <div className="copy-row">
        <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="btn btn--green" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
      </div>
    </Modal>
  );
}

// Create a word, or steal/extend an existing one. `target` = { word, own, owner } when stealing.
export function WordModal({ target, flipped, onSubmit, onClose }) {
  const [value, setValue] = useState('');
  const ref = useRef();
  useEffect(() => {
    ref.current && ref.current.focus();
    const t = setTimeout(onClose, Constants.GAME.PAUSED_TIMEOUT); // the server un-pauses after the same time
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = () => { if (value.length >= 3) onSubmit(value); };
  const title = !target ? 'Create a word' : target.own ? `Extend ${target.word}` : `Steal ${target.word}`;
  return (
    <Modal title={title} icon={!target ? '✍️' : target.own ? '🌱' : '🥷'} onClose={onClose}
      actions={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--green" disabled={value.length < 3} onClick={submit}>{target ? (target.own ? 'Extend' : 'Steal') : 'Create'}</button>
      </>}>
      <p className="hint">
        {target
          ? <>Type a new word using <b>all</b> the letters of <b>{target.word}</b> plus at least one from the middle.{!target.own && <> It can't be the same root (no just adding S, ED, ING…).</>}</>
          : <>Type a word (3+ letters) built from the letters in the middle.</>}
      </p>
      {target && <div style={{ textAlign: 'center', marginTop: '0.6rem' }}><Word word={target.word} /></div>}
      <div className="center-letters">
        <span className="center-letters__label">In the middle</span>
        {flipped.length ? flipped.map((l, i) => <Word key={i} word={l} size="sm" />) : <span className="hint" style={{ color: '#fff9' }}>nothing yet</span>}
      </div>
      <input ref={ref} className="input word-input" value={value} maxLength={30} placeholder="TYPE HERE" autoComplete="off" autoCapitalize="characters" spellCheck={false}
        onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <div className="timer"><i style={{ animationDuration: `${Constants.GAME.PAUSED_TIMEOUT}ms` }} /></div>
      <p className="hint" style={{ marginTop: '0.4rem' }}>Everyone's paused while you type ({Constants.GAME.PAUSED_TIMEOUT / 1000} seconds).</p>
    </Modal>
  );
}

export function LeaveModal({ privateRoom, onStay, onLeave }) {
  return (
    <Modal title="Leave this game?" icon="👋" onClose={onStay}
      actions={<><button className="btn btn--ghost" onClick={onStay}>Stay</button><button className="btn btn--red" onClick={onLeave}>Leave</button></>}>
      <p className="hint">Your words go back into the middle for the others.{privateRoom ? ' You can rejoin with the invite link while the game is still running.' : ''}</p>
    </Modal>
  );
}

export function MessageModal({ title, icon, message, onClose, button = 'OK' }) {
  return (
    <Modal title={title} icon={icon} onClose={onClose} actions={<button className="btn btn--block" onClick={onClose}>{button}</button>}>
      <p className="hint">{message}</p>
    </Modal>
  );
}

export function GameOverModal({ result, myName, onKeepPlaying, onLeave }) {
  const iWon = result.winners.includes(myName);
  return (
    <Modal title={iWon ? (result.winners.length > 1 ? 'You tied for the win!' : 'You win!') : `${result.winners.join(' & ')} won`} icon={iWon ? '🏆' : '🏁'} onClose={onKeepPlaying}
      actions={<><button className="btn btn--ghost" onClick={onLeave}>Leave</button><button className="btn btn--green" onClick={onKeepPlaying}>Play again</button></>}>
      <ul className="standings">
        {result.standings.map((s, i) => (
          <li key={i}><span className="rank">{i + 1}</span><span className="name">{s.nickname}{s.bot ? ' 🤖' : ''}</span><span className="pts">{s.score} letters</span></li>
        ))}
      </ul>
      <p className="hint" style={{ marginTop: '0.8rem' }}>A fresh game is already set up.</p>
    </Modal>
  );
}
