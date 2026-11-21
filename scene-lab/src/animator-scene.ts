import type { Scene } from './scene.ts';

const art = (name: string, version = 2): string => `${import.meta.env?.BASE_URL ?? './'}art/animator-${name}-v${version}.webp`;
const wide = { scale: 1, x: 16, y: 3 };
const boxer = { scale: 1.7, x: 0, y: 0 };
const rabbit = { scale: 1.55, x: 100, y: 0 };
const gesture = art('gesture');
const angry = art('ready');
const final = art('final');

export const animator: Scene = {
  id: 'animator', title: 'Тебе смешно?', subtitle: 'Глава 03 · Аниматор',
  intro: { location: 'После боя с Участковым. Дорога к МФЦ.', title: 'Пришлось узнать самому.' },
  image: art('wide'), imageAlt: 'Боксёр перед Аниматором в костюме Зайца. Заяц протягивает листовку; возле его ног запас листовок прижат кирпичом.',
  opponent: 'Аниматора', hardCuts: true,
  cues: [
    { id: 'officer-aftermath', label: 'Он знал, но не сказал', duration: 4600, speechDelay: 100,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Он знал куда мне нужно, но не сказал.',
      camera: { scale: 2.5, x: 100, y: 90 }, image: art('exit'),
      imageAlt: 'Поверженный Участковый лежит среди обломков своего стола.' },
    { id: 'memo', label: 'Пришлось узнать самому', duration: 3600, speechDelay: 250,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Пришлось узнать самому.', camera: wide,
      image: art('memo'), imageAlt: 'Памятка: «СПРАВКИ ОБ ОТСУТСТВИИ СУДИМОСТИ ВЫДАЮТСЯ В МФЦ!»',
      sounds: [{ at: 100, sound: 'paper' }] },
    { id: 'exit', label: 'Я направился в МФЦ', duration: 3000, speechDelay: 100,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Я направился в МФЦ.', camera: { scale: 1.1, x: 60, y: 90 },
      image: art('exit'), imageAlt: 'Боксёр выходит из кабинета. Деревянный стол разломан, избитый Участковый лежит на полу среди обломков и бумаг.' },
    { id: 'interruption', label: 'Ушастый зазывала', duration: 4000, speechDelay: 100,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Но меня остановил ушастый зазывала.', camera: wide,
      shots: [
        { at: 0, image: art('solo', 1), imageAlt: 'Боксёр идёт один вдоль магазина. Заяц и его лапы ещё не видны.', camera: wide },
        { at: 2000, image: art('wide'), imageAlt: 'Заяц протягивает листовку Боксёру. Запас бумаги на тротуаре прижат кирпичом.', camera: wide },
      ] },
    { id: 'directions', label: 'Где здесь МФЦ?', duration: 1800, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Где здесь МФЦ?', camera: boxer },
    { id: 'leaflet', label: 'Приведи друга', duration: 3200,
      speaker: '', text: '', camera: wide,
      image: art('leaflet', 1), imageAlt: 'Крупно листовка в лапе: «ПРИВЕДИ ДРУГА — ПОЛУЧИ ПОДАРОК!» Сначала пауза для чтения.',
      sounds: [{ at: 100, sound: 'paper' }] },
    { id: 'friend', label: 'Моего друга убили', duration: 2600, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Моего друга убили.', camera: boxer },
    { id: 'smile', label: 'Продолжает держать листовку', duration: 1800, speaker: '', text: '', camera: rabbit,
      imageAlt: 'Заяц не реагирует на рассказ об убийстве: всё та же улыбка, лапа по-прежнему протягивает листовку.' },
    { id: 'command', label: 'Тебе смешно?', duration: 1900, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Тебе смешно?', camera: boxer },
    { id: 'no-reaction', label: 'Всё та же улыбка', duration: 1100, speaker: '', text: '', camera: rabbit,
      imageAlt: 'Заяц молча продолжает протягивать листовку. Та же неподвижная улыбка.' },
    { id: 'gesture', label: 'Я спросил: тебе смешно?', duration: 2900, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Я спросил: тебе смешно?', camera: wide,
      image: gesture, imageAlt: 'Общий план: Заяц поднял локоть и лапу к верхней части головы, показывая на улыбку. Поза чуть напоминает замах; Боксёр пока только думает. Кирпич на запасе листовок.' },
    { id: 'raised-hand', label: 'Поднял на меня руку', duration: 3400, speechDelay: 100,
      speaker: 'Боксёр · про себя', voice: 'boxer', text: 'Но он уже поднял на меня руку.', camera: wide,
      image: gesture, imageAlt: 'Общий план остаётся: Боксёр серьёзно обдумывает поднятую лапу Зайца. Кирпич пока лежит на бумагах.' },
    { id: 'reaction', label: 'Лицо меняется', duration: 500, speaker: '', text: '', camera: wide,
      image: angry, imageAlt: 'Тот же общий план и позы, но лицо Боксёра стало злым. Кирпич остаётся на листовках.' },
    { id: 'forced', label: 'Чем вынудил меня защищаться', duration: 3300, speechDelay: 100,
      speaker: 'Боксёр · про себя', voice: 'boxer', text: 'Чем вынудил меня защищаться.', camera: wide,
      image: angry, imageAlt: 'Общий план не меняется: злое лицо Боксёра напротив высокой лапы Зайца. Рассказ о самозащите звучит спокойно.' },
    { id: 'settle', label: 'Решение принято', duration: 1400, speaker: '', text: '', camera: wide,
      image: angry, imageAlt: 'Боксёр пока держит руки опущенными; Заяц показывает на голову, кирпич остаётся на листовках.' },
    { id: 'fight-flash', label: 'Вспышка · Боксёр против Аниматора', duration: 120, speaker: '', text: '', camera: wide,
      image: final, imageAlt: 'Боксёр поднял кулаки, Заяц растерян с листовками и кирпичом. Новый рисунок появляется одновременно с титром.',
      fight: true, flash: true, sounds: [{ at: 0, sound: 'impact' }] },
    { id: 'fight', label: 'Боксёр против Аниматора', duration: 2380, speaker: '', text: '', camera: wide,
      image: final, imageAlt: 'Боксёр в боевой стойке против растерянного Зайца с листовками и кирпичом в разных лапах.', fight: true },
  ],
};
