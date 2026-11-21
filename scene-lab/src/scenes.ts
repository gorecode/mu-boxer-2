import { compileScene, type Scene } from './scene.ts';
import { banditScene } from './bandit-scene.ts';
import { epilogueScene } from './epilogue-scene.ts';
import { queue } from './queue-scene.ts';
import { intro } from './intro-scene.ts';
import { prologue } from './prologue-scene.ts';
import { workerScene } from './worker-scene.ts';
import { animator } from './animator-scene.ts';
import { sliderScene } from './slider-scene.ts';
import { serviceScene } from './service-scene.ts';

const art = (name: string): string => `${import.meta.env?.BASE_URL ?? './'}art/${name}.webp`;
const wide = { scale: 1, x: 50, y: 50 };
const precinct: Scene = {
  id: 'precinct', title: 'Вы пока посидите', subtitle: 'Глава 02 · Участковый',
  image: art('precinct-idle'),
  imageAlt: 'Боксёр стоит перед участковым. Трубка лежит на телефоне. На ботинках и полу свежий бетон.',
  opponent: 'Участкового',
  intro: { location: 'Москва. Кабинет участкового.', title: 'Мне только\nсправку получить.' },
  cues: [
    { id: 'arrival', label: 'Рабочий больше не возражал', duration: 6000, speechDelay: 150,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Рабочий больше не возражал. Я прошёл к участковому.',
      camera: wide, shots: [
        { at: 0, image: art('worker-aftermath-v2'), imageAlt: 'Рабочий лежит избитым на сухом краю; Боксёр идёт через свежий бетон к открытой двери участкового, оставляя глубокие следы.', camera: wide },
        { at: 600, image: art('worker-aftermath-v2'), imageAlt: 'Камера приближается к входящему Боксёру и испорченной дорожке. Рабочий остаётся на сухом покрытии.', camera: wide, cameraEnd: { scale: 1.05, x: 50, y: 45 } },
        { at: 3000, image: art('worker-aftermath-v2'), imageAlt: 'Выдержка на пути к открытой двери и следах в бетоне.', camera: { scale: 1.05, x: 50, y: 45 } },
      ] },
    { id: 'request', label: 'За справкой', duration: 4000, speaker: 'Боксёр', voice: 'boxer', camera: wide,
      text: 'Мне справку, что я не судимый.' },
    { id: 'call', label: 'Звонок', duration: 2000, speaker: '', camera: wide, text: '',
      sounds: [{ at: 100, sound: 'ring' }, { at: 1750, sound: 'receiver' }] },
    { id: 'report', label: 'Рабочего избили?', duration: 4000, speaker: 'Участковый · в трубку', voice: 'officer',
      image: art('precinct'), imageAlt: 'Участковый слушает трубку и подозрительно смотрит на посетителя.',
      camera: { scale: 1.6, x: 85, y: 35 }, text: 'Рабочего избили? Приметы?' },
    { id: 'clue', label: 'Ноги в бетоне?', duration: 1800, speaker: 'Участковый · в трубку', voice: 'officer',
      image: art('precinct'), imageAlt: 'Участковый уточняет приметы, слушая телефонную трубку.',
      camera: { scale: 1.6, x: 85, y: 35 }, text: 'Ноги в бетоне?' },
    { id: 'shoes', label: 'Бетонные ботинки', duration: 1200, speaker: '', text: '', image: art('precinct'),
      imageAlt: 'Крупный план ботинок боксёра со свежим бетоном и следов на полу.', camera: { scale: 2.3, x: 7, y: 100 } },
    { id: 'recognition', label: 'Понятно', duration: 1400, speaker: 'Участковый', voice: 'officer',
      image: art('precinct'), imageAlt: 'Участковый с трубкой смотрит прямо на боксёра.',
      camera: { scale: 1.85, x: 80, y: 38 }, text: 'Понятно.' },
    { id: 'sit', label: 'Вы пока посидите', duration: 2300, speechDelay: 100, speaker: 'Участковый', voice: 'officer',
      image: art('precinct'), imageAlt: 'Участковый с трубкой предлагает посетителю подождать.',
      camera: { scale: 1.85, x: 80, y: 38 }, text: 'Вы пока посидите.', sounds: [{ at: 2100, sound: 'receiver' }] },
    { id: 'thinking', label: 'Сидеть?!?', duration: 1400, speaker: 'Боксёр', voice: 'boxer', text: 'Сидеть?!?',
      image: art('boxer-thinking'), imageAlt: 'Обычное лицо боксёра крупным планом: рот закрыт, взгляд в сторону, он молча обдумывает услышанное.',
      camera: wide },
    { id: 'refusal', label: 'Не собираюсь!', duration: 4000, speaker: 'Боксёр', voice: 'boxer-angry',
      image: art('boxer-angry'), imageAlt: 'Разъярённое угловатое лицо боксёра: сведённые брови, злые глаза, стиснутые неровные зубы.',
      camera: wide, text: 'Ещё раз я не собираюсь!', sounds: [{ at: 0, sound: 'impact' }] },
    { id: 'fight', label: 'Перед боем', duration: 3000, speaker: '', camera: wide, text: '', fight: true,
      image: art('boxer-angry'), imageAlt: 'Разъярённый боксёр перед боем с участковым.' },
  ],
};

export const scenes = [compileScene(intro), compileScene(prologue), compileScene(workerScene), compileScene(precinct), compileScene(animator), compileScene(sliderScene), compileScene(serviceScene), compileScene(queue), compileScene(banditScene), compileScene(epilogueScene)];
