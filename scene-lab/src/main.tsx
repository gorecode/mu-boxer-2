import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configure } from 'mobx';
import { PlayerApp } from './player/app.tsx';
import './style.css';

configure({ enforceActions: 'always' });
const filmPage = document.body.dataset.view === 'film';
document.body.classList.toggle('film-view', filmPage);
createRoot(document.getElementById('app')!).render(<StrictMode><PlayerApp filmPage={filmPage} /></StrictMode>);
