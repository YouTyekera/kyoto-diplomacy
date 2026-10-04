import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './style.css';
import './design-tokens.css';
import './player-polish.css';
import './board-first.css';
import './operation-board.css';
import './landing-page.css';
import { AudioProvider } from './audio/AudioProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AudioProvider><App /></AudioProvider></React.StrictMode>);
