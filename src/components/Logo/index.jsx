import React from 'react';
import './logo.scss';

// Pure CSS/text logo: no image to download
const Logo = ({ size = 'lg', animate = false }) => (
  <div className={`logo logo--${size} ${animate ? 'logo--animate' : ''}`} role="img" aria-label="Scuffle">
    {[...'SCUFFLE'].map((c, i) => <span key={i} className="logo__tile" style={{ '--i': i }}>{c}</span>)}
  </div>
);
export default Logo;
