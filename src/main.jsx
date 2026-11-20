import React from 'react';
import { createRoot } from 'react-dom/client';
import './base.scss';
import App from './App';
import { applySettings } from './util/settings';

applySettings();

// Old links used hash URLs (/#/play?room=...): move them to real paths so they keep working
const legacy = window.location.hash.match(/^#\/(play|about|home)(\?.*)?$/);
if (legacy) window.history.replaceState(null, '', (legacy[1] === 'play' ? '/play' : '/') + (legacy[2] || ''));

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
