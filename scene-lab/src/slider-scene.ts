import type { Scene } from './scene.ts';

const art = (name: string): string => `${import.meta.env?.BASE_URL ?? './'}art/slider-${name}-v1.webp`;
const wide = { scale: 1, x: 0, y: 0 };
const boxer = { scale: 1.65, x: 0, y: 0 };
const slider = { scale: 1.4, x: 100, y: 10 };
const aftermath = art('aftermath');
const dialogue = art('dialogue');
const final = art('final');

export const sliderScene: Scene = {
  id: 'slider', title: 'На этот раз я готов', subtitle: 'Глава 04 · Неформал',
  intro: { location: 'После боя с Аниматором. Переход по дороге к МФЦ.', title: 'Я продолжил свой путь.' },
  image: dialogue, imageAlt: 'В подземном переходе Боксёр слева смотрит на Неформала в гриме и наколенниках. Друг Неформала снимает их на телефон.',
  opponent: 'Неформала', hardCuts: true,
  cues: [
    { id: 'aftermath', label: 'Я продолжил свой путь', duration: 4000, speechDelay: 150,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Я продолжил свой путь.', camera: boxer,
      shots: [
        { at: 0, image: aftermath, imageAlt: 'Крупно спокойный Боксёр. Поверженного Зайца пока не видно.', camera: { scale: 2.6, x: 0, y: 0 } },
        { at: 450, image: aftermath, imageAlt: 'Камера отходит от лица Боксёра и раскрывает поверженного Зайца, листовки и один кирпич на земле.', camera: { scale: 2.6, x: 0, y: 0 }, cameraEnd: wide },
        { at: 2100, image: aftermath, imageAlt: 'Общий план: Боксёр спокоен, Заяц лежит у магазина. Выдержка после раскрытия.', camera: wide },
      ] },
    { id: 'passage', label: 'До МФЦ — через дорогу', duration: 3800, speechDelay: 100,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'До МФЦ оставалось перейти дорогу.', camera: wide,
      image: art('passage'), imageAlt: 'Боксёр один в подземном переходе. Указатель МФЦ направлен вправо, по его маршруту.' },
    { id: 'slide', label: 'Бросились под ноги', duration: 3900, speechDelay: 150,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Но тут мне бросились под ноги.', camera: wide,
      image: art('slide'), imageAlt: 'Неформал скользит перед Боксёром на двух наколенниках. Его взрослый друг снимает со стороны на телефон.',
      shots: [
        { at: 0, image: art('slide'), imageAlt: 'Сначала в кадре только Боксёр, Неформал под ногами пока скрыт.', camera: { scale: 2.4, x: 0, y: 25 } },
        { at: 550, image: art('slide'), imageAlt: 'Камера отходит во время единой реплики и раскрывает скользящего Неформала.', camera: { scale: 2.4, x: 0, y: 25 }, cameraEnd: wide },
        { at: 2300, image: art('slide'), imageAlt: 'Неформал на наколенниках перед Боксёром, друг снимает. Выдержка.', camera: wide },
      ], sounds: [{ at: 900, sound: 'chair' }] },
    { id: 'question', label: 'Под ноги бросаешься?', duration: 3200, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Ты чего под ноги бросаешься?', camera: boxer,
      image: dialogue, imageAlt: 'Неформал уже встал. Боксёр смотрит на него без боевой стойки; руки опущены.' },
    { id: 'normies', label: 'Кошмарим на камеру', duration: 3200, speechDelay: 100,
      speaker: 'Неформал', voice: 'officer', text: 'Кошмарим нормисов на камеру!', camera: slider,
      image: dialogue, imageAlt: 'Неформал в белом гриме отвечает совершенно серьёзно. Наколенники видны, друг продолжает снимать.' },
    { id: 'processing', label: 'Нормисов?', duration: 650, speaker: '', text: '', camera: boxer,
      image: dialogue, imageAlt: 'Боксёр с обычным лицом обдумывает незнакомое слово. Короткая пауза.' },
    { id: 'normally', label: 'Нормально обратился', duration: 3450, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Я к тебе нормально обратился.', camera: boxer,
      image: dialogue, imageAlt: 'Тот же Боксёр, руки по-прежнему опущены: он уверен, что его не поняли.' },
    { id: 'recording', label: 'Камеру не выключай', duration: 2600, speechDelay: 100,
      speaker: 'Неформал · другу', voice: 'officer', text: 'Камеру не выключай.', camera: wide,
      image: dialogue, imageAlt: 'Неформал обращается к снимающему другу. Нового заезда ещё не видно.' },
    { id: 'recording-pause', label: 'Короткая пауза', duration: 500, speaker: '', text: '', camera: wide, image: dialogue },
    { id: 'repeat', label: 'Хотел повторить', duration: 2800, speechDelay: 100,
      speaker: 'Боксёр · про себя', voice: 'boxer', text: 'Он собирался повторить.', camera: wide,
      image: art('runup'), imageAlt: 'Неформал готовится ещё раз проскользить на наколенниках, Боксёр наблюдает; руки пока опущены.' },
    { id: 'witness', label: 'На этот раз я готов', duration: 3800, speechDelay: 250,
      speaker: 'Боксёр · про себя', voice: 'boxer', text: 'На этот раз я готов.', camera: wide,
      image: art('angry'), imageAlt: 'Тот же общий план. Меняется только лицо Боксёра: он хмурится, но ещё не поднял кулаки. Друг Неформала всё записывает.' },
    { id: 'fight-flash', label: 'Вспышка · Боксёр против Неформала', duration: 120,
      speaker: '', text: '', camera: wide, image: final,
      imageAlt: 'Боксёр поднял кулаки. Неформал прервал приготовление к заезду, друг продолжает снимать.',
      fight: true, flash: true, sounds: [{ at: 0, sound: 'impact' }] },
    { id: 'fight', label: 'Боксёр против Неформала', duration: 2380,
      speaker: '', text: '', camera: wide, image: final,
      imageAlt: 'Боевой Боксёр, растерянный глэм-блэк-слайдер и снимающий друг. Разговор завершён.', fight: true },
  ],
};
