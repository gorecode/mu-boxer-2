import '../../src/style.css';
import { gsap } from 'gsap/gsap-core';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { configure } from 'mobx';
import { PlayerApp } from '../../src/player/app.tsx';
import { LayerApp } from '../../src/experiments/layers/app.tsx';

configure({ enforceActions: 'always' });
Object.assign(window, { animationCount: () => gsap.globalTimeline.getChildren().length });
let root: Root | undefined;
function mount() {
  if (root) return;
  root = createRoot(document.getElementById('app')!);
  const mode = new URLSearchParams(location.search).get('view');
  root.render(<StrictMode>{mode === 'layers' ? <LayerApp /> : <PlayerApp filmPage={mode === 'film'} />}</StrictMode>);
}
document.getElementById('fixture-unmount')!.onclick = () => { root?.unmount(); root = undefined; };
document.getElementById('fixture-mount')!.onclick = mount;
mount();
