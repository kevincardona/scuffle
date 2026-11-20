import React, { Component } from 'react';
import { getSocket, joinRoom, leaveRoom, triggerAction } from '../../util/api';
import { play } from '../../util/sound';
import Constants from '../../constants';
import ControlPanel from '../../components/ControlPanel';
import Leaderboard from '../../components/Leaderboard';
import Chat from '../../components/Chat';
import Tile from '../../components/Tile';
import Logo from '../../components/Logo';
import Toggles from '../../components/Toggles';
import WordCallout from '../../components/WordCallout';
import { HelpModal, InviteModal, WordModal, LeaveModal, MessageModal, GameOverModal } from '../../components/Modals';
import './room.scss';

const readPref = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } };
const savePref = (k, v) => { try { localStorage.setItem(k, String(v)) } catch { /* ignore */ } };

export default class Room extends Component {
  constructor(props) {
    super(props);
    this.state = { split: Number(readPref('scuffle.split', 58)), sideW: Number(readPref('scuffle.sideW', 22)), loading: true, socket: null, isFinished: false, paused: false, reconnecting: false, chatOpen: (() => { try { return localStorage.getItem('scuffle.chat') !== 'closed' } catch { return true } })(), modal: null, toasts: [], callouts: [], flipped: [], players: [], unflipped: 0 }
    this.toastId = 0
  }

  componentDidMount() {
    this.connect();
    window.addEventListener('keydown', this.onKey);
    this.ticker = setInterval(() => { if (this.state.fillAt) this.forceUpdate() }, 1000);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.onKey);
    clearInterval(this.ticker);
    const { socket } = this.state
    if (!socket) return
    leaveRoom(socket)
    socket.close()
  }

  connect = () => {
    const { room, nickname, isPrivate, bots, difficulty } = this.props
    const socket = getSocket()
    // (Re)join on every connect: after a network blip the server hands our old seat back
    socket.on('connect', () => {
      this.setState({ reconnecting: false })
      const { roomId, privateRoom } = this.state
      joinRoom(socket, roomId
        ? { room: roomId, nickname, isPrivate: !!privateRoom }
        : { room: room || undefined, nickname, isPrivate: !!isPrivate, bots, difficulty })
    })
    socket.on('disconnect', (reason) => { if (reason !== 'io client disconnect') this.setState({ reconnecting: true }) })
    socket.on(Constants.MSG_TYPES.ERROR, (data) => {
      // Our public game vanished (e.g. the server restarted): quietly drop into a fresh one instead of kicking us out
      if (data.reason === 'gone' && this.state.roomId && !this.state.privateRoom) {
        this.setState({ roomId: undefined, loading: true, flipped: [], players: [], unflipped: 0, isFinished: false, callouts: [] })
        this.toast('The game was reset (server restart). Finding you a new one…')
        return joinRoom(socket, { nickname, isPrivate: false })
      }
      play('error'); this.setState({ modal: { type: 'error', message: data.message } })
    })
    socket.on(Constants.MSG_TYPES.GAME_UPDATE, this.updateRoom)
    socket.on(Constants.MSG_TYPES.WORD_EVENT, this.onWordEvent)
    socket.on(Constants.MSG_TYPES.GAME_OVER, (result) => {
      play(result.winners.includes(this.props.nickname) ? 'win' : 'word')
      this.setState({ modal: { type: 'gameover', result } })
    })
    socket.on(Constants.MSG_TYPES.MESSAGE, (m) => {
      if (m.typeModifier === 'private' && m.message && m.message.length < 140) { this.toast(m.message); play('error') }
    })
    this.setState({ socket })
  }

  exit = () => { if (this.props.onExit) this.props.onExit() }

  toast = (text) => {
    const id = ++this.toastId
    this.setState((s) => ({ toasts: [...s.toasts, { id, text }] }))
    setTimeout(() => this.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
  }

  onWordEvent = (event) => {
    play(event.kind === 'steal' ? 'steal' : event.kind === 'extend' ? 'extend' : (event.kind === 'invalid' || event.kind === 'miss') ? 'error' : 'word')
    // Always show the newest thing that happened (no queue, so it can't lag behind the game). A fresh "oops" never
    // knocks a just-made word off the screen.
    const isOops = (e) => e.kind === 'invalid' || e.kind === 'miss'
    this.setState((s) => {
      const cur = s.callouts[0]
      if (cur && isOops(event) && !isOops(cur) && Date.now() - cur.at < 1500) return null
      return { callouts: [{ ...event, id: ++this.toastId, at: Date.now() }] }
    })
  }

  updateRoom = (data) => {
    const prev = this.state
    const me = prev.socket && prev.socket.id
    if (!prev.loading && data.flipped.length > prev.flipped.length) play('flip')
    if (!prev.loading && data.currentPlayer === me && prev.currentPlayer !== me && data.unflippedCount > 0) play('turn')
    const mine = data.players.find((p) => p.playerId === me)
    this.setState({
      fillAt: data.fillInMs != null && !data.privateRoom && data.players.length < 2 ? Date.now() + data.fillInMs : 0,
      lockUntil: mine && mine.lockCooldown > 0 ? Date.now() + mine.lockCooldown * 1000 : 0,
      loading: false,
      currentPlayer: data.currentPlayer,
      players: data.players,
      unflipped: data.unflippedCount,
      flipped: data.flipped,
      room: data.roomName,
      roomId: data.roomId,
      privateRoom: data.privateRoom,
      paused: data.paused,
      pausedPlayer: data.pausedPlayer
    })
    if (data.unflippedCount > 0 && prev.isFinished) this.setState({ isFinished: false })
  }

  isWaiting() { const { privateRoom, players } = this.state; return !privateRoom && players.length < 2 }

  isMyTurn() { const { socket, currentPlayer, unflipped } = this.state; return !!socket && currentPlayer === socket.id && unflipped > 0 }

  onKey = (e) => {
    if (this.state.modal || e.metaKey || e.ctrlKey || e.altKey) return
    const tag = e.target && e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
    if (e.key === ' ' && this.isMyTurn()) { e.preventDefault(); triggerAction(this.state.socket, { command: Constants.COMMANDS.FLIP }) }
    if ((e.key === 'c' || e.key === 'C') && !this.state.isFinished) this.togglePopup('create')
  }

  setFinished = (finished) => this.setState({ isFinished: finished })

  togglePopup = (type) => {
    const { socket, paused, pausedPlayer, players } = this.state
    if (type === 'invite') return this.setState({ modal: { type: 'invite' } })
    if (type === 'help') return this.setState({ modal: { type: 'help' } })
    if (type === 'leave') return this.setState({ modal: { type: 'leave' } })
    if (type === 'create') return this.openWordModal(null)
  }

  openWordModal = (target) => {
    const { socket, paused, pausedPlayer, players, isFinished, lockUntil, flipped } = this.state
    if (isFinished) return
    if (lockUntil > Date.now()) return this.toast(`Wait ${Math.ceil((lockUntil - Date.now()) / 1000)}s before pausing the game again.`)
    if (flipped.length === 0) return this.toast('Nothing in the middle yet. Wait for a flip!')
    if (!target && flipped.length < 3) return this.toast('You need at least 3 letters in the middle to make a word.')
    if (paused && pausedPlayer !== socket.id) {
      const p = players.find((x) => x.playerId === pausedPlayer)
      return this.toast(`${p ? p.nickname : 'Someone'} is typing a word. Try again in a sec!`)
    }
    triggerAction(socket, { command: Constants.COMMANDS.PAUSE_GAME })
    this.setState({ modal: { type: 'word', target } })
  }

  closeWordModal = () => {
    triggerAction(this.state.socket, { command: Constants.COMMANDS.UNPAUSE_GAME })
    this.setState({ modal: null })
  }

  submitWord = (word) => {
    const { socket, modal } = this.state
    const t = modal.target
    triggerAction(socket, t
      ? { command: Constants.COMMANDS.STEAL_WORD, args: [{ playerId: t.playerId, word: t.word }, word] }
      : { command: Constants.COMMANDS.CREATE_WORD, args: [word] })
    this.closeWordModal()
  }

  closeModal = () => this.setState({ modal: null })

  // Drag handles: the player list / chat divider, and the sidebar width
  startDrag = (kind) => (e) => {
    e.preventDefault()
    const move = (ev) => {
      const side = this.sideRef
      if (!side) return
      const r = side.getBoundingClientRect()
      if (kind === 'split') this.setState({ split: Math.min(85, Math.max(20, ((ev.clientY - r.top) / r.height) * 100)) })
      else this.setState({ sideW: Math.min(40, Math.max(16, (window.innerWidth - ev.clientX) / 16)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      savePref('scuffle.split', Math.round(this.state.split)); savePref('scuffle.sideW', Math.round(this.state.sideW))
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  toggleChat = () => this.setState((s) => {
    try { localStorage.setItem('scuffle.chat', s.chatOpen ? 'closed' : 'open') } catch { /* ignore */ }
    return { chatOpen: !s.chatOpen };
  })

  banner() {
    const { socket, players, currentPlayer, unflipped, isFinished, paused, pausedPlayer } = this.state
    const nameOf = (id) => { const p = players.find((x) => x.playerId === id); return p ? p.nickname : 'Someone' }
    if (this.isWaiting()) {
      const s = this.state.fillAt ? Math.max(0, Math.ceil((this.state.fillAt - Date.now()) / 1000)) : null
      return { tone: 'wait', title: 'Waiting for players…', hint: s === null ? 'Waiting for someone to join.' : s > 0 ? `Share the invite link! If nobody joins, bots will fill in about ${s}s.` : 'Bringing in some bots…' }
    }
    if (paused && pausedPlayer !== socket.id) return { tone: 'pause', title: `${nameOf(pausedPlayer)} is typing a word…`, hint: 'Hold on, the game is paused for a few seconds.' }
    if (unflipped === 0) {
      return isFinished
        ? { tone: 'wait', title: 'Waiting for the others…', hint: 'The game ends when everyone has pressed Finished.' }
        : { tone: 'end', title: 'All letters are flipped!', hint: 'Make or steal any last words, then press Finished.' }
    }
    if (currentPlayer === socket.id) return { tone: 'you', title: 'Your turn: flip a letter!', hint: 'Spot a word in the letters at any time? Press Create word.' }
    return { tone: 'wait', title: `${nameOf(currentPlayer)} is flipping…`, hint: 'See a word (3+ letters)? Be quick: press Create word and type it.' }
  }

  renderModal() {
    const { modal, flipped, privateRoom, roomId } = this.state
    if (!modal) return null
    switch (modal.type) {
      case 'help': return <HelpModal onClose={this.closeModal} />
      case 'invite': return <InviteModal onClose={this.closeModal} link={`${window.location.origin}/play?${privateRoom ? 'p' : ''}room=${roomId}`} />
      case 'word': return <WordModal target={modal.target} flipped={flipped} onSubmit={this.submitWord} onClose={this.closeWordModal} />
      case 'leave': return <LeaveModal privateRoom={privateRoom} onStay={this.closeModal} onLeave={this.exit} />
      case 'gameover': return <GameOverModal result={modal.result} myName={this.props.nickname} onKeepPlaying={this.closeModal} onLeave={this.exit} />
      case 'error': return <MessageModal title="Heads up" icon="⚠️" message={modal.message} onClose={this.exit} button="Back to menu" />
      default: return null
    }
  }

  render() {
    const { socket, loading, flipped, players, room, unflipped, isFinished, currentPlayer, reconnecting, toasts, callouts, modal } = this.state
    if (loading) {
      return (
        <div className="loading">
          <Logo animate />
          <p>{this.props.bots ? 'Setting up your game…' : 'Finding a game…'}</p>
          {this.renderModal()}
        </div>
      )
    }
    const banner = this.banner()
    return (
      <div id="room">
        <header className="topbar">
          <button className="topbar__logo" title="Leave game" onClick={() => this.togglePopup('leave')}><Logo size="sm" /></button>
          <div className="topbar__room">{room}<span className="topbar__pill">{unflipped} left to flip</span></div>
          <Toggles />
          <button className="btn btn--small btn--ghost" onClick={() => this.togglePopup('invite')}>Invite</button>
          <button className="btn btn--small btn--ghost" onClick={() => this.togglePopup('help')}>How to play</button>
          <button className="btn btn--small btn--red" onClick={() => this.togglePopup('leave')}>Leave</button>
        </header>
        {reconnecting && <div className="reconnect">Connection lost. Reconnecting…</div>}
        <main className="layout" style={{ '--side-w': `${this.state.sideW}rem` }}>
          <section className="board">
            <div className={`banner banner--${banner.tone}`}>
              <strong>{banner.title}</strong>
              <span>{banner.hint}</span>
            </div>
            <div className="table">
              <div id="letters--container">
                {flipped.length === 0
                  ? <p className="board__empty">Flipped letters appear here.</p>
                  : flipped.map((letter, i) => <Tile key={i} letter={letter} />)}
              </div>
              {callouts.length > 0 &&
                <WordCallout key={callouts[0].id} event={callouts[0]} mine={callouts[0].playerId === socket.id}
                  onDone={() => this.setState((s) => (s.callouts[0] && s.callouts[0].id === callouts[0].id ? { callouts: [] } : null))} />}
            </div>
            <ControlPanel socket={socket} togglePopup={this.togglePopup} unflipped={unflipped} finished={isFinished}
              setFinished={this.setFinished} currentPlayer={currentPlayer} lockUntil={this.state.lockUntil} waiting={this.isWaiting()} />
          </section>
          <aside className="side" ref={(el) => { this.sideRef = el }} style={{ '--split': `${this.state.split}%` }}>
            <div className="resize resize--col" onPointerDown={this.startDrag('side')} title="Drag to resize" />
            <Leaderboard socket={socket} players={players} currentPlayer={currentPlayer}
              onWordClick={(player, word, own) => this.openWordModal({ playerId: player.playerId, word, own })} />
            {this.state.chatOpen && <div className="resize resize--row" onPointerDown={this.startDrag('split')} title="Drag to resize" />}
            <Chat socket={socket} open={this.state.chatOpen} onToggle={this.toggleChat} />
          </aside>
        </main>
        <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
        {this.renderModal()}
      </div>
    )
  }
}
