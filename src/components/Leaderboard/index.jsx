import React, { PureComponent } from 'react';
import Word from '../Word';
import './leaderboard.scss';

export default class Leaderboard extends PureComponent {
  render() {
    const { socket, players, currentPlayer, onWordClick } = this.props
    const sorted = players ? [...players].sort((a, b) => {
      if (a.playerId === socket.id) return -1;
      if (b.playerId === socket.id) return 1;
      return (b.score || 0) - (a.score || 0);
    }) : []
    return (
      <div id="leaderboard">
        <div className="leaderboard__title">Players</div>
        <div className="leaderboard__list">
          {sorted.map((player, index) => {
            const me = player.playerId === socket.id
            return (
              <div key={player.playerId} className={`player color--${index % 7} ${currentPlayer === player.playerId ? 'player--current' : ''} ${player.connected ? '' : 'player--away'}`}>
                <div className="player__header">
                  <span className="player__name">{player.bot ? '🤖 ' : ''}{player.nickname}{me ? ' (you)' : ''}</span>
                  {currentPlayer === player.playerId && <em className="player__turn">flipping</em>}
                  {!player.connected && <em className="player__turn player__turn--away">reconnecting…</em>}
                  <span className="player__score">{player.score || 0}<small> pts</small></span>
                </div>
                <div className="player__words">
                  {player.words && player.words.length > 0
                    ? player.words.map((word, i) => (
                        <Word key={word + i} word={word} size="xs" onClick={() => onWordClick(player, word, me)}
                          title={me ? 'Click to extend this word' : 'Click to steal this word'} />))
                    : <span className="player__nowords">no words yet</span>}
                </div>
              </div>
            )
          })}
        </div>
        <p className="leaderboard__tip">Tap a word to steal it (or extend your own).</p>
      </div>
    )
  }
}
