import { SceneAudio } from '../audio.ts';
import type { PlayerServices } from './store.ts';

export const browserServices: PlayerServices = {
  createAudio: onError => new SceneAudio(onError),
  now: () => performance.now(),
  writeLink: hash => history.replaceState(null, '', hash),
  loadImages: (sources, signal) => Promise.all(sources.map(source => new Promise<void>((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.removeAttribute('src'); reject(new DOMException('Aborted', 'AbortError')); };
    image.onload = () => { cleanup(); resolve(); };
    image.onerror = () => { cleanup(); reject(new Error(source)); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    image.src = source;
  }))).then(() => {}),
};
