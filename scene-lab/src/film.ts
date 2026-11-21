import { compileScene, type CompiledScene } from './scene.ts';

export function compileFilm(scenes: CompiledScene[]) {
  if (!scenes.length || new Set(scenes.map(scene => scene.id)).size !== scenes.length || scenes.some(scene => scene.id === 'film')) {
    throw new Error('Игрофильм требует непустой список уникальных сцен');
  }
  let start = 0;
  const chapters = scenes.map(scene => {
    const chapter = { scene, start, end: start + scene.duration };
    start = chapter.end;
    return chapter;
  });
  const scene = compileScene({
    id: 'film', title: 'Игрофильм', subtitle: 'Все кат-сцены подряд',
    intro: { location: 'От прошлого Боксёра до нового героя.', title: 'Месть Боксёра II' },
    image: scenes[0].image, imageAlt: scenes[0].imageAlt, opponent: '',
    cues: scenes.flatMap(scene => scene.cues.map(cue => ({
      ...cue, id: `${scene.id}/${cue.id}`, label: `${scene.title} · ${cue.label}`,
      image: cue.image ?? scene.image, imageAlt: cue.imageAlt ?? scene.imageAlt,
    }))),
  });
  return { scene, chapters };
}

export function chapterAt(film: ReturnType<typeof compileFilm>, time: number) {
  if (!Number.isFinite(time)) throw new Error('Неверная позиция игрофильма');
  return film.chapters.find(chapter => time < chapter.end) ?? film.chapters[film.chapters.length - 1];
}
