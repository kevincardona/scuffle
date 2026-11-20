import React, { Component } from 'react';
import { sendMessage } from '../../util/api';
import Constants from '../../constants';
import './chat.scss';

const HIDDEN_KINDS = new Set(['flip', 'turn']); // the board and banner already show these

export default class Chat extends Component {
  constructor(props) {
    super(props);
    this.listRef = React.createRef();
    this.state = { messages: [], input: '', unread: 0 };
  }

  componentDidMount() {
    this.onMessage = (m) => this.setState((s) => {
      const noisy = m.kind === 'flip' || m.kind === 'turn';
      const mine = m.playerId === this.props.socket.id;
      return { messages: [...s.messages, m].slice(-200), unread: this.props.open || noisy || mine ? s.unread : s.unread + 1 };
    });
    this.props.socket.on(Constants.MSG_TYPES.MESSAGE, this.onMessage);
  }

  componentWillUnmount() { this.props.socket.off(Constants.MSG_TYPES.MESSAGE, this.onMessage); }

  componentDidUpdate(prev) {
    if (this.props.open && !prev.open && this.state.unread) this.setState({ unread: 0 });
    const el = this.listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  send = (e) => {
    if (e) e.preventDefault();
    const text = this.state.input.trim();
    if (text) sendMessage(this.props.socket, text);
    this.setState({ input: '' });
  };

  render() {
    const { socket, open, onToggle } = this.props;
    if (!open) {
      return (
        <button id="chat-collapsed" onClick={onToggle}>
          💬 Chat{this.state.unread > 0 && <span className="chat__badge">{this.state.unread}</span>}
        </button>
      );
    }
    const messages = this.state.messages.filter((m) => !HIDDEN_KINDS.has(m.kind));
    return (
      <div id="chat">
        <div className="chat__title">Chat<button className="chat__hide" onClick={onToggle}>Hide</button></div>
        <ul id="messages" ref={this.listRef}>
          {messages.length === 0 && <li className="chat__empty">Say hi, or just play. Game events show up here too.</li>}
          {messages.map((m, i) => {
            if (m.type === Constants.CHAT_MSG_TYPES.PLAYER_MESSAGE) {
              const mine = m.playerId === socket.id;
              return (
                <li key={i} className={`msg ${mine ? 'msg--mine' : ''}`}>
                  {!mine && <span className="msg__name">{m.player}</span>}
                  <span className="msg__bubble">{m.message}</span>
                </li>
              );
            }
            const cls = m.typeModifier === 'private' ? 'sys sys--private' : m.kind === 'word' ? 'sys sys--word' : m.kind === 'oops' ? 'sys sys--oops' : 'sys';
            return <li key={i} className={cls}>{m.message}</li>;
          })}
        </ul>
        <form className="chat__input" onSubmit={this.send}>
          <input className="input" placeholder="Type a message…" maxLength={200} value={this.state.input} onChange={(e) => this.setState({ input: e.target.value })} />
          <button className="btn btn--small" type="submit" disabled={!this.state.input.trim()}>Send</button>
        </form>
      </div>
    );
  }
}
