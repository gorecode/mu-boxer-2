import type { Scene } from './scene.ts';

const art = (name: string): string => `${import.meta.env?.BASE_URL ?? './'}art/${name}.webp`;
const wide = { scale: 1, x: 50, y: 50 };
const boxer = { scale: 1.45, x: 0, y: 0 };
const worker = { scale: 1.45, x: 100, y: 25 };
const courtyard = art('worker-wide-v2');
const ready = art('worker-ready-v2');

export const workerScene: Scene = {
  id: 'worker', title: 'А вот же лента', subtitle: 'Глава 01 · Рабочий',
  intro: { location: 'Двор. В двух шагах от участкового.', title: 'Но путь мне перегородили.' },
  image: courtyard,
  imageAlt: 'Боксёр слева перед лентой, Рабочий справа у свежей дорожки. Позади него дверь участкового; обувь Боксёра чистая.',
  opponent: 'Рабочего', hardCuts: true,
  cues: [
    { id: 'obstacle', label: 'Путь перегорожен', duration: 3600, speechDelay: 150,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Но путь мне перегородил рабочий.', camera: wide },
    { id: 'request', label: 'Мне к участковому', duration: 2400, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Мне к участковому.', camera: boxer },
    { id: 'detour', label: 'Обходи', duration: 1500, speechDelay: 100,
      speaker: 'Рабочий', voice: 'officer', text: 'Обходи.', camera: worker },
    { id: 'door', label: 'Так вот же дверь', duration: 1900, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Так вот же дверь.', camera: wide,
      image: art('worker-boxer-point-v2'), imageAlt: 'Спокойный Боксёр указывает на близкую дверь участкового за Рабочим.' },
    { id: 'tape', label: 'А вот же лента', duration: 2300, speechDelay: 100,
      speaker: 'Рабочий', voice: 'officer', text: 'А вот же лента.', camera: wide,
      image: art('worker-tape-v2'), imageAlt: 'Рабочий деловито показывает на ленту перед Боксёром; никто не нападает.' },
    { id: 'reason', label: 'Сам шёл к участковому', duration: 3400, speechDelay: 150,
      speaker: 'Боксёр · про себя', voice: 'boxer',
      text: 'Я сам шёл к участковому.', camera: boxer },
    { id: 'realization', label: 'Даже туда не пускали', duration: 3900, speechDelay: 100,
      speaker: 'Боксёр · про себя', voice: 'boxer', text: 'Но даже туда меня не хотели пускать.', camera: boxer },
    { id: 'flash', label: 'Принято решение', duration: 120, speaker: '', text: '',
      image: ready, imageAlt: 'Боксёр поднял кулаки перед растерянным Рабочим. Переход через вспышку.', camera: wide,
      flash: true, sounds: [{ at: 0, sound: 'impact' }] },
    { id: 'inevitable', label: 'Придётся подвинуться', duration: 2800, speechDelay: 100,
      speaker: 'Боксёр · про себя', voice: 'boxer', text: 'Придётся подвинуться.', camera: wide,
      image: ready, imageAlt: 'Общий план: Боксёр в боевой стойке, Рабочий с лопатой стоит на сухом покрытии и не нападает.' },
    { id: 'fight', label: 'Боксёр против Рабочего', duration: 2500,
      speaker: '', text: '', camera: wide, image: ready,
      imageAlt: 'Боксёр в боевой стойке перед растерянным Рабочим. Бой ещё не начался.', fight: true },
  ],
};
