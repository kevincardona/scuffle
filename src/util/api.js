import io from 'socket.io-client';
import Constants from '../constants';

export const apiGet = (endpoint) =>
  fetch(`/api/${endpoint}`, { headers: { Accept: 'application/json' } })
    .then((res) => res.json())
    .catch((error) => { console.warn(error); return null; });

// Stable per-tab id so a dropped connection can reclaim its seat in a game
const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));
export const getPlayerKey = () => {
  try {
    let key = sessionStorage.getItem('scuffle.key');
    if (!key) { key = uuid(); sessionStorage.setItem('scuffle.key', key); }
    return key;
  } catch { return uuid(); }
};

export const getSocket = () => io({ reconnection: true, reconnectionDelay: 800, reconnectionDelayMax: 4000, reconnectionAttempts: Infinity });

export const triggerAction = (socket, action) => { if (socket) socket.emit(Constants.MSG_TYPES.PLAYER_ACTION, action); };
export const leaveRoom = (socket) => { if (socket) socket.emit(Constants.MSG_TYPES.LEAVE_ROOM); };
export const joinRoom = (socket, opts) => { if (socket) socket.emit(Constants.MSG_TYPES.JOIN_ROOM, { key: getPlayerKey(), ...opts }); };
export const sendMessage = (socket, message) => { if (socket) socket.emit(Constants.MSG_TYPES.MESSAGE, message); };
