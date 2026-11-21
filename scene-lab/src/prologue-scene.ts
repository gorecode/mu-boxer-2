import type { Scene } from './scene.ts';

const art = (name: string): string => `${import.meta.env?.BASE_URL ?? './'}art/${name}.webp`;
const wide = { scale: 1, x: 50, y: 50 };
const tomorrow = { scale: 1.65, x: 50, y: 45 };
const certificate = { scale: 1.8, x: 50, y: 100 };
const doorway = { scale: 1.12, x: 55, y: 45 };
const threshold = { scale: 1.22, x: 55, y: 45 };
const gym = art('intro-gym-v4');
const notice = art('prologue-notice-v1');
const thinking = art('prologue-thinking-v1');
const exit = art('prologue-exit-v1');

export const prologue: Scene = {
  id: 'prologue', title: 'Мне нужна справка', subtitle: 'Завязка · Турнир завтра',
  intro: { location: 'Спортзал. Накануне турнира.', title: 'Мне нужна справка' },
  image: gym, imageAlt: 'Боксёр сосредоточенно тренируется у груши в старом зале.',
  opponent: '', hardCuts: true,
  cues: [
    { id: 'training', label: 'Районный турнир', duration: 3800, speechDelay: 200,
      speaker: 'Боксёр · рассказ', voice: 'boxer', camera: wide,
      text: 'Я готовился к районному турниру.', image: gym },
    { id: 'tomorrow', label: 'Турнир завтра', duration: 3500, speechDelay: 250,
      speaker: 'Боксёр · рассказ', voice: 'boxer', camera: wide,
      text: 'Он должен был состояться завтра.', shots: [
        { at: 0, image: notice, imageAlt: 'Объявление о районном турнире на стене зала.', camera: wide },
        { at: 350, image: notice, imageAlt: 'Камера выделяет крупное слово «ЗАВТРА».', camera: wide, cameraEnd: tomorrow },
        { at: 2100, image: notice, imageAlt: 'Неподвижная выдержка на сроке турнира.', camera: tomorrow },
      ] },
    { id: 'certificate', label: 'Условие допуска', duration: 6000, speechDelay: 200,
      speaker: 'Боксёр · рассказ', voice: 'boxer', camera: tomorrow,
      text: 'Но для участия мне нужна была справка об отсутствии судимости.', shots: [
        { at: 0, image: notice, imageAlt: 'Камера переходит к требованию справки на том же объявлении.', camera: tomorrow, cameraEnd: certificate },
        { at: 1400, image: notice, imageAlt: 'Нижняя часть объявления: «ДЛЯ ДОПУСКА — СПРАВКА».', camera: certificate },
      ], sounds: [{ at: 0, sound: 'paper' }] },
    { id: 'uncertainty', label: 'Где получить?', duration: 3500, speechDelay: 250,
      speaker: 'Боксёр · рассказ', voice: 'boxer', camera: wide,
      text: 'Где её получить, я не знал.', image: thinking,
      imageAlt: 'Обычное размышляющее лицо Боксёра; за ним стены зала и канаты ринга.' },
    { id: 'decision', label: 'Спросить участкового', duration: 3400, speechDelay: 250,
      speaker: 'Боксёр · рассказ', voice: 'boxer', camera: wide,
      text: 'Решил спросить у участкового.', image: thinking,
      imageAlt: 'Боксёр обдумал, к кому обратиться. Тот же неподвижный портрет в зале.' },
    { id: 'urgency', label: 'Пора выходить', duration: 2900, speechDelay: 250,
      speaker: 'Боксёр · рассказ', voice: 'boxer', camera: wide,
      text: 'Времени оставалось мало.', shots: [
        { at: 0, image: exit, imageAlt: 'Из полутёмного зала виден силуэт Боксёра в светлом дверном проёме, спиной к зрителю.', camera: wide },
        { at: 500, image: exit, imageAlt: 'Камера медленно приближается к выходящему из зала Боксёру.', camera: wide, cameraEnd: doorway },
        { at: 2200, image: exit, imageAlt: 'Силуэт Боксёра на пороге спортзала.', camera: doorway },
      ], sounds: [{ at: 100, sound: 'chair' }] },
    { id: 'departure', label: 'Искать участкового', duration: 4200, speechDelay: 150,
      speaker: 'Боксёр · рассказ', voice: 'boxer', camera: doorway,
      text: 'Я отправился искать участкового.', shots: [
        { at: 0, image: exit, imageAlt: 'Силуэт Боксёра на выходе: позади остаются груша и ринг.', camera: doorway },
        { at: 300, image: exit, imageAlt: 'Приближение к силуэту в дневном свете. Снаружи только свет.', camera: doorway, cameraEnd: threshold },
        { at: 2700, image: exit, imageAlt: 'Финальная выдержка на силуэте Боксёра, выходящего из спортзала.', camera: threshold },
      ] },
  ],
};
