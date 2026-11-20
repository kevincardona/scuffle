import React, { useEffect } from 'react';
import { BrowserRouter, Routes as RouterRoutes, Route, Navigate, useLocation } from 'react-router-dom';

import Home from './pages/Home';
import Menu from './pages/Menu';
import Tutorial from './pages/Tutorial';

const TITLES = {
  '/': 'Scuffle: Free Multiplayer Word Game to Play With Friends',
  '/play': 'Play Scuffle: Free Online Word Game',
  '/learn': 'Learn to Play Scuffle: Interactive Word Game Tutorial',
};

function TitleSync() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = TITLES[pathname] || TITLES['/']; }, [pathname]);
  return null;
}

function Routes() {
  return (
    <BrowserRouter>
      <TitleSync />
      <RouterRoutes>
        <Route path="/" element={<Home />} />
        <Route path="/play" element={<Menu />} />
        <Route path="/learn" element={<Tutorial />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </RouterRoutes>
    </BrowserRouter>
  );
}

export default Routes;
