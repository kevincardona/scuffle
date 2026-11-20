import React from 'react';
import Word from '../Word';
import './rules.scss';

// Shared by the Home page and the in-game "How to play" dialog
const STEPS = [
  { icon: '🎴', title: 'Flip', text: 'On your turn, flip a letter into the middle. Everyone sees it.',
    demo: <Word word="T" size="lg" /> },
  { icon: '⚡', title: 'Spot a word', text: 'See 3+ letters that spell a word? Hit Create word and type it first. Those letters are yours.',
    demo: <><Word word="CAT" size="lg" /></> },
  { icon: '🌱', title: 'Grow it', text: 'Add at least one letter from the middle to one of your words to make a longer one.',
    demo: <><Word word="CAT" size="sm" /><b className="op">+</b><Word word="S" size="sm" hi={[0]} /><b className="op">=</b><Word word="CATS" size="sm" hi={[3]} /></> },
  { icon: '🥷', title: 'Steal', text: "Click someone else's word and rebuild it with a letter from the middle. It has to be a truly different word: CAT → CATS doesn't count.",
    demo: <><Word word="CAT" size="sm" /><b className="op">+</b><Word word="R" size="sm" hi={[0]} /><b className="op">=</b><Word word="CART" size="sm" hi={[2]} /></> },
  { icon: '🏁', title: 'Win', text: 'When the middle is empty and nobody can play, everyone presses Finished. Most letters wins!',
    demo: <span className="rules__trophy">🏆</span> },
];

export default function Rules({ compact = false }) {
  return (
    <div className={`rules ${compact ? 'rules--compact' : ''}`}>
      <ol className="rules__steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rules__step" style={{ '--i': i }}>
            <div className="rules__num">{i + 1}</div>
            <div className="rules__text"><h3>{s.icon} {s.title}</h3><p>{s.text}</p></div>
            <div className="rules__demo">{s.demo}</div>
          </li>
        ))}
      </ol>
      <div className="rules__tips">
        <h4>Good to know</h4>
        <ul>
          <li>Use <strong>all</strong> of the old word's letters, plus at least one from the middle.</li>
          <li>No stealing with the <strong>same root</strong>: adding S, ED or ING to someone's word isn't allowed. (You can still grow your own.)</li>
          <li>Words need 3+ letters and must be real English words.</li>
          <li>Too slow to flip? The turn moves on after 15 seconds.</li>
          <li>Dictionary missing a word? In a private room type <code>/override word</code>.</li>
        </ul>
      </div>
    </div>
  );
}
