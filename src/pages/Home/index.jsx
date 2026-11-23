import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../../components/Logo';
import Rules from '../../components/Rules';
import Toggles from '../../components/Toggles';
import './home.scss';

const Home = () => (
  <div id="home">
    <div className="home__toggles"><Toggles /></div>
    <header className="home__hero">
      <Logo />
      <h1 className="sr-only">Scuffle: a free multiplayer word game</h1>
      <p>Race your friends to spot words in a pile of flipped letters. Steal theirs when you can.</p>
      <div className="home__buttons">
        <Link to="/play" className="btn btn--lg">Play now</Link>
        <Link to="/learn" className="btn btn--lg btn--ghost">Learn in 1 minute</Link>
      </div>
    </header>
    <section className="home__rules">
      <h2>How to play</h2>
      <Rules />
      <Link to="/play" className="btn btn--green btn--lg home__cta">Let's play</Link>
    </section>
    <footer className="home__credit">
      Made by <a href="https://kevincardona.net">Kevin Cardona</a>
    </footer>
  </div>
);
export default Home;
