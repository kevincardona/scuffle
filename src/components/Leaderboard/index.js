import React, {PureComponent} from 'react';
import Word from '../Word';
import './leaderboard.scss';

export default class Leaderboard extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {}
  }
  render() {
    const {socket, players, currentPlayer, unflipped, togglePopup, room} = this.props
    return (
      <div id="leaderboard">
        <div className="leaderboard__header">
          <h2>{room}</h2>
          <div className="leaderboard__header--buttons">
            <button className="leaderboard__button--invite" onClick={()=>togglePopup('invite')}>INVITE</button>
            <button className="leaderboard__button--help" onClick={()=>togglePopup('help')}>HELP</button>
          </div>
        </div>
        <div className="leaderboard__players">
          <h4 className="leaderboard__players--header">
            PLAYERS
            <div className="leaderboard__info--unflipped">
              UNFLIPPED TILES: <span className="unflipped">{unflipped}</span>
            </div>
          </h4>
          <div className="leaderboard__players--container">
            <div className="leaderboard__players--words">
            {
              players && players
                .sort((a, b)=>{
                  if (a.playerId === socket.id) return -1;
                  if (b.playerId === socket.id) return 1;
                  if (a.score > b.score) return -1;
                  if (b.score > a.score) return 1;
                  return 0;
                })
                .map((player, index) => {
                  return (
                    <div key={index} className={`player color--${index%7} ${currentPlayer === player.playerId ? 'player--current':''}`}>
                      <div className="player__header" disabled={!player.active}>
                        <div className="player__header--name" >                  
                          {player.nickname}
                        </div>
                        <div className="player__header--score">
                          POINTS: {player.score ? player.score : 0}
                        </div>
                      </div>
                      <div className="player__words">
                        {
                          player.words && player.words.map((word, index)=> {
                            return (
                              <Word key={index} word={word} onClick={() => togglePopup('steal', { player: {...player, word: word }})}/>
                            )
                          })
                        }
                      </div>
                    </div>
                  )
                })
            }
            </div>
          </div>
        </div>
      </div>
    )
  }
}