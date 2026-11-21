import type { Scene } from './scene.ts';

const art = (name: string, version = 1): string => `${import.meta.env?.BASE_URL ?? './'}art/service-${name}-v${version}.webp`;
const wide = { scale: 1, x: 0, y: 20 };
const boxer = { scale: 1.6, x: 0, y: 15 };
const angelika = { scale: 1.5, x: 100, y: 15 };
const aftermath = art('aftermath');
const idle = art('wide');
const invite = art('invite');
const angry = art('angry');
const final = art('final');

export const serviceScene: Scene = {
  id: 'service', title: 'Покажи, что умеешь', subtitle: 'Глава 05 · Служебный вход',
  intro: { location: 'После боя с Неформалом. Здание МФЦ.', title: 'Сразу к сотрудникам.' },
  image: idle, imageAlt: 'Боксёр слева в гримёрной клуба. Справа Анжелика в закрытом леопардовом халате и тапочках со связкой ключей.',
  opponent: 'Стриптизёрши', hardCuts: true,
  cues: [
    { id: 'aftermath', label: 'Ты снял, кто начал?', duration: 4000, speechDelay: 150,
      speaker: 'Боксёр', voice: 'boxer', text: 'Ты снял, что он первый начал?', camera: wide,
      shots: [
        { at: 0, image: aftermath, imageAlt: 'Сначала лицо спокойного Боксёра. Поверженный Неформал пока за краем кадра.', camera: { scale: 2.6, x: 0, y: 20 } },
        { at: 350, image: aftermath, imageAlt: 'Камера отходит, раскрывая лежащего Неформала и растерянного снимающего друга. Друг не подтверждает слова Боксёра.', camera: { scale: 2.6, x: 0, y: 20 }, cameraEnd: wide },
        { at: 2000, image: aftermath, imageAlt: 'Общий план последствий: Боксёр спокоен, Неформал лежит, его друг продолжает держать телефон. Выдержка.', camera: wide },
      ] },
    { id: 'building', label: 'Нужное здание', duration: 3500, speechDelay: 100,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'Я добрался до нужного здания.', camera: wide,
      image: art('building'), imageAlt: 'В одном здании две отдельные двери: справа открытый публичный вход с вывеской МФЦ, слева служебная дверь. Боксёр подходит слева.' },
    { id: 'staff', label: 'Сразу к сотрудникам', duration: 4500, speechDelay: 500,
      speaker: 'Боксёр · рассказ', voice: 'boxer', text: 'И решил сразу обратиться к сотрудникам.', camera: wide,
      image: art('door', 2), imageAlt: 'Боксёр открывает служебную дверь. Табличка СЛУЖЕБНЫЙ ВХОД показана крупно и сначала получает время для чтения; голова Боксёра целиком видна.' },
    { id: 'backstage', label: 'За служебной дверью', duration: 700, speaker: '', text: '', camera: wide,
      image: idle, imageAlt: 'Гримёрная: зеркало с лампочками, сценические вещи и Анжелика в халате. Сигарета уже лежит в пепельнице. Ключи в правой руке, левая опущена.' },
    { id: 'closed', label: 'Мальчик, мы закрыты', duration: 2500, speechDelay: 100,
      speaker: 'Анжелика', voice: 'grandma', text: 'Мальчик, мы закрыты.', camera: angelika,
      image: idle, imageAlt: 'Анжелика буднично обращается к вошедшему. Голова и причёска целиком в кадре; ключи остаются в её правой руке.' },
    { id: 'documents', label: 'Справку взять', duration: 2600, speechDelay: 100,
      speaker: 'Боксёр', voice: 'boxer', text: 'Мне справку взять.', camera: boxer,
      image: idle, imageAlt: 'Боксёр с обычным лицом отвечает Анжелике. Руки опущены; голова не обрезана.' },
    { id: 'dancing', label: 'Танцевать пришёл?', duration: 2200, speechDelay: 100,
      speaker: 'Анжелика', voice: 'grandma', text: 'Танцевать пришёл?', camera: angelika,
      image: idle, imageAlt: 'Анжелика принимает пришедшего с документами мужчину за соискателя. Не нападает и не хватает Боксёра.' },
    { id: 'processing', label: 'Осмысление', duration: 650, speaker: '', text: '', camera: boxer,
      image: idle, imageAlt: 'Боксёр молча обдумывает вопрос о танцах. Лицо обычное, руки опущены.' },
    { id: 'audition', label: 'Покажи, что умеешь', duration: 2700, speechDelay: 100,
      speaker: 'Анжелика', voice: 'grandma', text: 'Покажи, что умеешь.', camera: wide,
      image: invite, imageAlt: 'Анжелика открытой левой ладонью указывает на свободное место перед зеркалом. Правой держит ключи. Боксёр размышляет, руки опущены; сигарета в пепельнице.' },
    { id: 'thought', label: 'Не было времени на танцы', duration: 3800, speechDelay: 100,
      speaker: 'Боксёр · про себя', voice: 'boxer', text: 'У меня не было времени на танцы.', camera: wide,
      image: invite, imageAlt: 'Тот же общий план: спокойный Боксёр смотрит на приглашающую ладонь Анжелики. Предметы и позы сохраняются.' },
    { id: 'reaction', label: 'Лицо меняется', duration: 500, speaker: '', text: '', camera: wide,
      image: angry, imageAlt: 'Тот же рисунок и ракурс: меняется только лицо Боксёра, оно становится злым. Кулаки пока не подняты.' },
    { id: 'forced', label: 'Я был вынужден показать', duration: 4100, speechDelay: 100,
      speaker: 'Боксёр · про себя', voice: 'boxer', text: 'Я был вынужден показать то, что умею.', camera: wide,
      image: angry, imageAlt: 'Злой Боксёр всё ещё с опущенными руками. Анжелика ждёт демонстрации умений, ключи в правой руке, сигарета в пепельнице.' },
    { id: 'fight-flash', label: 'Вспышка · Боксёр против Стриптизёрши', duration: 120,
      speaker: '', text: '', camera: wide, image: final,
      imageAlt: 'Только с титром Боксёр поднимает кулаки. Анжелика растерянно опускает приглашающую руку, сохраняя ключи в другой.',
      fight: true, flash: true, sounds: [{ at: 0, sound: 'impact' }] },
    { id: 'fight', label: 'Боксёр против Стриптизёрши', duration: 2380,
      speaker: '', text: '', camera: wide, image: final,
      imageAlt: 'Боксёр в боевой стойке перед растерянной Анжеликой в закрытом халате. Титр остаётся, вспышка закончилась.', fight: true },
  ],
};
