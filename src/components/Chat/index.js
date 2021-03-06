import React, {Component, Fragment} from 'react';
import {sendMessage} from '../../util/api';
import Constants from '../../constants';
import './chat.scss';

export default class Chat extends Component {
  constructor(props) {
    super(props);
    this.messageRef = React.createRef();
    this.state = {
      messages: [],
      input: "",
    }
  }

  componentDidMount() {
    const {socket} = this.props;
    socket.on(Constants.MSG_TYPES.MESSAGE, (message) => {
      this.getMessage(message);
      if (this.messageRef.current)
        this.messageRef.current.scrollTop = this.messageRef.current.scrollHeight
    })
  }

  updateInput = (e) => {
    this.setState({input: e.target.value})
  }

  getMessage = (message) => {
    this.setState({ messages: this.state.messages.concat(message) })
  }

  send = (event) => {
    const {socket} = this.props
    if (event)
      event.preventDefault();
    if (this.state.input )
    if (this.state.input)
      sendMessage(socket, this.state.input)
    this.setState({input: ""})
  }

  onKeyPress = event => {
    if (event.key === 'Enter') {
      this.send()
    }
  }

  render() {
    const {input, messages} = this.state
    const {socket} = this.props
    return (
      <div id="chat">
        <ul id="messages" ref={this.messageRef}>
          {
            messages.map((data, index) => {
              switch (data.type) {
                case Constants.CHAT_MSG_TYPES.PLAYER_MESSAGE:
                  return (
                    <li key={index} className="message">
                      { data.playerId === socket?.id ?
                        <label className="message__bubble message__bubble--player-current">{data.message}</label>
                        :
                        <Fragment>
                          <label className="font-weight-bold">{data.player + ':'}</label>
                          {" "}
                          <label className="message__bubble">{data.message}</label>
                        </Fragment>
                      }
                    </li>
                  )
                case Constants.CHAT_MSG_TYPES.SERVER_MESSAGE:
                  return (
                    <li key={index} className="message">
                      <label className="font-weight-bold">
                        <span role="img" aria-label="server-icon">🎮</span>:
                      </label>
                      {" "}
                      <label className="message__bubble message__bubble--server-info">{data.message}</label>
                    </li>
                  )
                default:
              }
              return null
            })
          }
        </ul>
        <div className="chat__input input-group">
          <input type="text" className="form-control chat__input--message" placeholder="Message" onKeyPress={this.onKeyPress} value={input} onChange={(e) => this.updateInput(e)}/>
          <div className="input-group-append">
            <button className="btn btn-primary input-group-btn" onClick={this.send}>Send</button>
          </div>
        </div>
      </div>
    )
  }

}