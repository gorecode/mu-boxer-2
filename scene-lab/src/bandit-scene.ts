import type { Scene } from './scene.ts';

const art = (name: string, version = 1): string => `${import.meta.env?.BASE_URL ?? './'}art/bandit-${name}-v${version}.webp`;
const wide = { scale: 1, x: 0, y: 15 };
const boxer = { scale: 1.65, x: 0, y: 15 };
const chief = { scale: 1.6, x: 100, y: 15 };
const office = art('office', 2);
const phone = art('phone', 2);
const angry = art('angry');
const final = art('final');

export const banditScene: Scene = {
  id: 'bandit', title: 'Там не ответят', subtitle: 'Глава 07 · Начальник',
  intro: { location: 'МФЦ. После боя в очереди.', title: 'Я пошёл к начальнику.' },
  image: office, imageAlt: 'Боксёр слева узнаёт Бандита из бильярдной, теперь сидящего за столом начальника МФЦ.',
  opponent: 'Бандита', hardCuts: true,
  cues: [
    { id: 'queue-aftermath', label: 'Добрался до окошка', duration: 4000, speechDelay: 100,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Наконец-то я добрался до окошка.', camera: wide,
      shots: [
        { at: 0, image: art('queue', 2), imageAlt: 'Спокойное лицо Боксёра в приёмной. Бабка пока вне кадра.', camera: { scale: 2.5, x: 0, y: 15 } },
        { at: 350, image: art('queue', 2), imageAlt: 'Во время речи камера отходит к лежащей Бабке, клетчатой сумке и закрытому окну.', camera: { scale: 2.5, x: 0, y: 15 }, cameraEnd: wide },
        { at: 2100, image: art('queue', 2), imageAlt: 'Боксёр добрался до окна, но оно уже закрыто. Бабка лежит рядом с сумкой. Выдержка.', camera: wide },
      ] },
    { id: 'lunch', label: 'Но уже закрыто', duration: 3300, speechDelay: 100, speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Но оно уже было закрыто.', image: art('queue', 2),
      imageAlt: 'На закрытом окошке крупная табличка ОБЕД.', camera: { scale: 1.8, x: 100, y: 5 } },
    { id: 'therefore', label: 'Поэтому', duration: 1900, speechDelay: 100, speaker: 'Боксёр · рассказ', voice: 'boxer',
      text: 'Поэтому.', image: art('queue', 2), imageAlt: 'Закрытое окошко ОБЕД. Решение героя.', camera: { scale: 1.8, x: 100, y: 5 } },
    { id: 'chief-door', label: 'К начальнику', duration: 3000, speechDelay: 150,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Я пошёл к начальнику.', image: art('door'),
      imageAlt: 'Боксёр открывает дверь НАЧАЛЬНИК. Сидящий внутри пока не показан.', camera: wide },
    { id: 'recognition', label: 'Знакомое лицо', duration: 700, speaker: '', text: '', camera: wide },
    { id: 'question', label: 'Ты?!?', duration: 1400, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Ты?!?', camera: boxer },
    { id: 'how', label: 'Как ты здесь?', duration: 2100, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Как ты здесь?', camera: boxer },
    { id: 'prison', label: 'На этот раз сядешь', duration: 3500, speechDelay: 100,
      speaker: 'Бандит', voice: 'officer', text: 'На этот раз ты сядешь надолго.', camera: chief },
    { id: 'unanswered', label: 'Звонок участковому', duration: 1900, speaker: '', text: '', image: phone,
      imageAlt: 'Бандит держит трубку у уха. На телефоне табличка УЧАСТКОВЫЙ. Исходящие гудки без ответа.', camera: { scale: 2, x: 100, y: 65 },
      sounds: [{ at: 0, sound: 'receiver' }, { at: 150, sound: 'ringback' }, { at: 1150, sound: 'ringback' }] },
    { id: 'no-answer', label: 'Там не ответят', duration: 2500, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Там не ответят.', image: phone, camera: wide,
      imageAlt: 'Боксёр спокойно смотрит на Бандита с трубкой. После реплики выдержка на реакции начальника.' },
    { id: 'hang-up', label: 'Трубка на базе', duration: 550, speaker: '', text: '', camera: chief,
      sounds: [{ at: 0, sound: 'receiver' }] },
    { id: 'personal', label: 'По-своему', duration: 4000, speechDelay: 100,
      speaker: 'Бандит', voice: 'officer', text: 'Тогда я разберусь с тобой по-своему.', camera: chief },
    { id: 'processing', label: 'После угрозы', duration: 450, speaker: '', text: '', camera: chief },
    { id: 'chief-anger', label: 'Ярость Бандита', duration: 900, speaker: '', text: '', image: final,
      camera: { scale: 3.4, x: 82, y: 16 }, imageAlt: 'Злое лицо Бандита крупно. Ответная реакция Боксёра ещё не показана.' },
    { id: 'anger', label: 'Ярость Боксёра', duration: 850, speaker: '', text: '', image: angry, camera: boxer,
      imageAlt: 'Боксёр отвечает разъярённым взглядом. Руки ещё опущены.' },
    { id: 'face-off', label: 'Оба готовы к драке', duration: 650, speaker: '', text: '', image: final, camera: wide,
      imageAlt: 'Общий план: оба противника в боевых стойках. Титра пока нет.' },
    { id: 'fight-fade', label: 'Затемнение перед боем', duration: 300, speaker: '', text: '', image: final, camera: wide,
      imageAlt: 'После короткой выдержки боевые стойки уходят в затемнение.', blackout: { from: 0, to: .65 } },
    { id: 'fight-flash', label: 'Боксёр против Бандита', duration: 120, speaker: '', text: '', image: final, camera: wide,
      imageAlt: 'Боксёр поднял кулаки, Бандит встал из-за стола. После затемнения появляется титр со вспышкой.',
      fight: true, flash: true, sounds: [{ at: 0, sound: 'impact' }] },
    { id: 'fight', label: 'Последний бой', duration: 2380, speaker: '', text: '', image: final, camera: wide,
      imageAlt: 'Боксёр против Бандита. Телефон на базе, бланки на столе; последствия боя ещё не показаны.', fight: true },
  ],
};
