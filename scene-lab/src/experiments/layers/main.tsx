import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configure } from 'mobx';
import { LayerApp } from './app.tsx';

configure({ enforceActions: 'always' });
createRoot(document.getElementById('app')!).render(<StrictMode><LayerApp /></StrictMode>);
