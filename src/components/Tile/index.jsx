import React from 'react';
import './tile.scss';

const Tile = ({ letter }) => <div className="tile">{letter}</div>;
export default React.memo(Tile);
