import React, { useEffect, useState } from 'react';
import { triggerAction } from '../../util/api';
import Constants from '../../constants';
import './controlPanel.scss';

const useCountdown = (until) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until || until <= Date.now()) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [until]);
  return until && until > now ? Math.ceil((until - now) / 1000) : 0;
};

const ControlPanel = ({ togglePopup, unflipped, finished, setFinished, socket, currentPlayer, lockUntil, waiting }) => {
  const wait = useCountdown(lockUntil);
  const act = (command) => triggerAction(socket, { command })
  const myTurn = unflipped !== 0 && currentPlayer === socket.id
  return (
    <div id="control-panel">
      {waiting
        ? <button className="control__button control__button--waiting" disabled>Waiting for players…</button>
        : myTurn
        ? <button className="control__button control__button--flip" onClick={() => act(Constants.COMMANDS.FLIP)}>Flip a letter <kbd>space</kbd></button>
        : unflipped === 0 && !finished
          ? <button className="control__button control__button--finished" onClick={() => { setFinished(true); act(Constants.COMMANDS.DONE) }}>Finished</button>
          : <button className="control__button control__button--waiting" disabled>{unflipped === 0 ? 'Waiting for the others…' : 'Waiting for your turn…'}</button>}
      {!finished &&
        <button className="control__button control__button--create" disabled={wait > 0} onClick={() => togglePopup('create')}>
          {wait > 0 ? `Create word (${wait}s)` : <>Create word <kbd>C</kbd></>}
        </button>}
    </div>
  )
}
export default ControlPanel
