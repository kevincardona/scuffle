import React, { useState } from 'react';
import { isSoundOn, setSound } from '../../util/sound';
import { SettingsModal } from '../Modals';

export default function Toggles() {
  const [sound, setSoundState] = useState(isSoundOn());
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
    <button className="icon-btn" title={sound ? 'Sound on' : 'Sound off'} aria-label="Toggle sound" aria-pressed={sound}
      onClick={() => { setSound(!sound); setSoundState(!sound); }}>{sound ? '🔊' : '🔇'}</button>
    <button className="icon-btn" title="Customize" aria-label="Customize" onClick={() => setOpen(true)}>🎨</button>
    {open && <SettingsModal onClose={() => setOpen(false)} />}
    </div>
  );
}
