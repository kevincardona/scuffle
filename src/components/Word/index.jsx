import React from 'react';
import './word.scss';

// `hi` = array of letter indexes to highlight (used for the newly added letters)
const Word = ({ word, onClick, title, size = 'md', hi = [], className = '' }) => (
  <div className={`word word--${size} ${onClick ? 'word--clickable' : ''} ${className}`} onClick={onClick} title={title}>
    {[...word].map((letter, i) => (
      <div key={i} className={`word__letter ${hi.includes(i) ? 'word__letter--new' : ''}`}>{letter}</div>
    ))}
  </div>
);
export default Word;
