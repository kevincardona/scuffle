import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiGet } from '../../util/api';
import { play } from '../../util/sound';
import Room from '../Room';
import Logo from '../../components/Logo';
import Toggles from '../../components/Toggles';
import './menu.scss';

const DIFFICULTIES = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const savedName = () => { try { return localStorage.getItem('scuffle.name') || '' } catch { return '' } };

const Menu = () => {
  const location = useLocation();
  const [nickname, setNickname] = useState(savedName);
  const [room, setRoom] = useState('');
  const [joining, setJoining] = useState(false);       // arrived through an invite link
  const [isPrivate, setPrivate] = useState(false);
  const [game, setGame] = useState(null);              // null = in the menu, otherwise the options we joined with
  const [playerCount, setPlayerCount] = useState(0);
  const [botsOpen, setBotsOpen] = useState(false);
  const [bots, setBots] = useState(1);
  const [difficulty, setDifficulty] = useState('medium');

  useEffect(() => {
    apiGet('playercount').then((res) => { if (res && res.success) setPlayerCount(res.playerCount) });
    const params = new URLSearchParams(location.search);
    const target = params.get('room') || params.get('proom');
    setJoining(Boolean(target));
    setPrivate(params.has('proom'));
    setRoom(target || '');
  }, [location.search, game]);

  const name = nickname.trim();
  const start = (opts = {}) => {
    if (!name) return;
    try { localStorage.setItem('scuffle.name', name) } catch { /* ignore */ }
    play('click');
    setGame({ room, isPrivate, ...opts });
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && name && !game && e.target.id === 'nickname-input') start(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (game) return <Room nickname={name} {...game} onExit={() => setGame(null)} />;

  return (
    <div id="play-menu">
      <div className="menu__toggles"><Toggles /></div>
      <div className="menu__card">
        <Logo />
        <p className="menu__tagline">A short, confused struggle for letters.</p>
        {!joining && <p className="menu__count"><i /> {playerCount} online</p>}
        <input id="nickname-input" className="input" type="text" autoComplete="off" autoFocus placeholder="Your name" maxLength={15}
          value={nickname} onChange={(e) => setNickname(e.target.value)} />

        <button className="btn btn--lg btn--block menu__play" disabled={!name} onClick={() => start()}>
          {joining ? 'Join game' : 'Play online'}
        </button>

        {!joining && (
          <>
            <button className="btn btn--green btn--block" disabled={!name} onClick={() => setBotsOpen((o) => !o)} aria-expanded={botsOpen}>
              🤖 Play vs bots
            </button>
            {botsOpen && (
              <div className="menu__bots">
                <div className="menu__row"><span>Opponents</span>
                  <div className="seg">{[1, 2, 3].map((n) => <button key={n} aria-pressed={bots === n} onClick={() => setBots(n)}>{n}</button>)}</div>
                </div>
                <div className="menu__row"><span>Difficulty</span>
                  <div className="seg">{DIFFICULTIES.map(([v, l]) => <button key={v} aria-pressed={difficulty === v} onClick={() => setDifficulty(v)}>{l}</button>)}</div>
                </div>
                <button className="btn btn--green btn--block" disabled={!name} onClick={() => start({ bots, difficulty, isPrivate: true, room: '' })}>Start game</button>
              </div>
            )}
            <div className="menu__links">
              <button className="menu__link" disabled={!name} onClick={() => start({ isPrivate: true, room: '' })}>Private room with friends</button>
              <Link className="menu__link" to="/learn">New? Learn in 1 minute</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Menu;
