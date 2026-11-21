import { expect, test } from '@playwright/test';
import { scenes } from '../src/scenes.ts';
import { compileFilm } from '../src/film.ts';
const bandit = scenes.find(scene => scene.id === 'bandit')!;
const epilogue = scenes.find(scene => scene.id === 'epilogue')!;
const cue = (id: string) => bandit.cues.find(cue => cue.id === id)!;
const end = (id: string) => epilogue.cues.find(cue => cue.id === id)!;

test('lunch, causal pause, recognition, phone and two angry faces retain separate beats', async ({ page }) => {
  await page.goto('./#scene=bandit&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  for (const [id, image, text] of [
    ['queue-aftermath', 'queue-v2', 'Наконец-то я добрался до окошка.'],
    ['lunch', 'queue-v2', 'Но оно уже было закрыто.'], ['therefore', 'queue-v2', 'Поэтому.'],
    ['chief-door', 'door-v1', 'Я пошёл к начальнику.'], ['question', 'office-v2', 'Ты?! Как ты здесь…'],
    ['prison', 'office-v2', 'На этот раз ты сядешь надолго.'], ['unanswered', 'phone-v1', ''],
    ['no-answer', 'phone-v1', 'Там не ответят.'], ['personal', 'office-v2', 'Тогда я разберусь с тобой по-своему.'],
    ['anger', 'angry-v1', ''], ['chief-anger', 'final-v1', ''],
  ]) {
    await page.locator('#scrub').fill(String(cue(id).end - 1));
    await expect(page.locator('#art')).toHaveAttribute('src', new RegExp(`bandit-${image}.webp$`));
    await expect(page.locator('#caption-typed')).toHaveText(text);
    await expect(page.locator('#fight')).toBeHidden();
  }
  expect(await page.locator('#art').evaluate(el => el.style.transform)).toBe('scale(3.4)');
  await page.locator('#scrub').fill(String(cue('fight-flash').start));
  await expect(page.locator('#fight')).toBeVisible();
  expect(await page.locator('#art').evaluate(el => el.style.transform)).toBe('scale(1)');
  await expect(page.locator('#opponent')).toHaveText('БАНДИТА');
});

test('the Bandit closeup cuts to the title through a playing-only flash', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto(`./#scene=bandit&t=${(cue('fight-flash').start - 100) / 1000}`);
  await expect(page.locator('#start')).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.locator('#mute').click();
  await page.locator('#start').click();
  await page.clock.runFor(50);
  await expect(page.locator('#fight')).toBeHidden();
  expect(await page.locator('#art').evaluate(el => el.style.transform)).toBe('scale(3.4)');
  await page.clock.runFor(100);
  await expect(page.locator('#fight')).toBeVisible();
  await expect(page.locator('#scene-flash')).toBeVisible();
  await page.locator('#play').click();
  await expect(page.locator('#scene-flash')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#play').click();
  await page.clock.runFor(30);
  await expect(page.locator('#scene-flash')).toBeHidden();
});

test('epilogue panels preserve accusations, paper states and gratitude before the angry last line', async ({ page }) => {
  await page.goto('./#scene=epilogue&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  expect(await page.locator('#art').evaluate(el => el.style.transformOrigin)).toBe('100% 65%');
  for (const [id, image, text] of [
    ['won', 'epilogue-aftermath-v1', 'Сегодня свой турнир по боксу я выиграл.'],
    ['city', 'epilogue-city-v1', 'Этот город прогнил насквозь.'],
    ['bandits', 'animator-wide-v2', 'Бандиты.'], ['devil-worshippers', 'slider-dialogue-v1', 'Дьяволопоклонники.'],
    ['hero', 'epilogue-doorway-v3', 'Этому городу нужен новый герой.'],
    ['law', 'epilogue-crumple-v2', 'Который научит ценить и уважать закон…'],
    ['discard', 'epilogue-discard-v2', ''], ['order', 'epilogue-exit-v2', 'И порядок.'],
    ['thanks', 'epilogue-vow-v1', 'Этот город ещё скажет мне спасибо.'],
    ['thanks-pause', 'epilogue-vow-v1', ''], ['last-anger', 'epilogue-vow-angry-v1', ''],
    ['everything', 'epilogue-vow-angry-v1', 'За ВСЁ.'],
  ]) {
    await page.locator('#scrub').fill(String(end(id).end - 1));
    await expect(page.locator('#art')).toHaveAttribute('src', new RegExp(`${image}.webp$`));
    await expect(page.locator('#caption-typed')).toHaveText(text);
    await expect(page.locator('#title-card')).toBeHidden();
    await expect(page.locator('#fight')).toBeHidden();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`black fade freezes on pause, survives seek and film composition and precedes credits: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
    await page.goto(`./#scene=epilogue&t=${end('fade').start / 1000}`);
    await expect(page.locator('#start')).toBeEnabled();
    await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
    await page.locator('#mute').click();
    await page.locator('#start').click();
    await page.clock.runFor(850);
    const opacity = Number(await page.locator('#scene-blackout').evaluate(el => el.style.opacity));
    expect(opacity).toBeGreaterThan(.45);
    expect(opacity).toBeLessThan(.55);
    await expect(page.locator('#title-card')).toBeHidden();
    await page.locator('#play').click();
    await page.clock.runFor(1000);
    expect(Number(await page.locator('#scene-blackout').evaluate(el => el.style.opacity))).toBe(opacity);
    await page.locator('#scrub').fill(String(end('end').start));
    await expect(page.locator('#scene-blackout')).toHaveCSS('opacity', '1');
    await expect(page.locator('#title-card-title')).toHaveText('КОНЕЦ');
    await expect(page.locator('#title-card')).toBeVisible();
    await expect(page.locator('#title-card')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.locator('#scrub').fill(String(end('thanks').start));
    await expect(page.locator('#scene-blackout')).toHaveCSS('opacity', '0');
    await expect(page.locator('#title-card')).toBeHidden();
    await page.locator('#mode-select').selectOption('film');
    await expect(page.locator('#start')).toBeEnabled();
    const chapter = compileFilm(scenes).chapters.at(-1)!;
    await page.locator('#scrub').fill(String(chapter.start + end('fade').start + 850));
    await expect(page.locator('#scene-blackout')).toHaveCSS('opacity', '0.5');
    await page.locator('#scrub').fill(String(compileFilm(scenes).scene.duration));
    await expect(page.locator('#title-card')).toBeVisible();
    await expect(page.locator('#title-card')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.locator('#play').click();
    await page.clock.runFor(100);
    await expect(page.locator('#scene-blackout')).toHaveCSS('opacity', '0');
    await expect(page.locator('#scene-select')).toHaveValue('intro');
  });
}

interface SoundWindow extends Window {
  soundContexts: (AudioContext & { meter: AnalyserNode })[];
  sirens: { start: number; end: number; stopped: boolean }[];
  ringbacks: number[];
}

test('the actual audio graph produces a swept siren after the last words and cancels it on pause and mute', async ({ page }) => {
  await page.addInitScript(() => {
    const browser = window as unknown as SoundWindow;
    browser.soundContexts = []; browser.sirens = []; browser.ringbacks = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor() {
        super();
        const meter = this.createAnalyser(); meter.fftSize = 2048;
        browser.soundContexts.push(Object.assign(this, { meter }));
        const nativeGain = this.createGain.bind(this); let first = true;
        this.createGain = () => { const gain = nativeGain(); if (first) { gain.connect(meter); first = false; } return gain; };
      }
      createOscillator(): OscillatorNode {
        const oscillator = super.createOscillator();
        const set = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        const ramp = oscillator.frequency.exponentialRampToValueAtTime.bind(oscillator.frequency);
        const stop = oscillator.stop.bind(oscillator);
        let recorded: SoundWindow['sirens'][number] | undefined;
        oscillator.frequency.setValueAtTime = (value, at) => {
          if (value === 425) browser.ringbacks.push(value);
          if (value === 600 || value === 1050) { recorded = { start: value, end: 0, stopped: false }; browser.sirens.push(recorded); }
          return set(value, at);
        };
        oscillator.frequency.exponentialRampToValueAtTime = (value, at) => { if (recorded) recorded.end = value; return ramp(value, at); };
        oscillator.stop = at => { if (recorded && at === undefined) recorded.stopped = true; stop(at); };
        return oscillator;
      }
    };
  });
  await page.goto(`./#scene=epilogue&t=${end('siren').start / 1000}`);
  await expect(page.locator('#start')).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as SoundWindow).sirens)).toEqual([]);
  await page.locator('#start').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as SoundWindow).sirens.length)).toBe(8);
  expect(await page.evaluate(() => (window as unknown as SoundWindow).sirens.map(({ start, end }) => [start, end]))).toEqual(Array.from({ length: 4 }, () => [[600, 1050], [1050, 600]]).flat());
  await expect.poll(() => page.evaluate(() => {
    const buffer = new Float32Array(2048);
    (window as unknown as SoundWindow).soundContexts[0].meter.getFloatTimeDomainData(buffer);
    return buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length;
  })).toBeGreaterThan(.0001);
  await page.locator('#play').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as SoundWindow).soundContexts[0].state)).toBe('suspended');
  expect(await page.evaluate(() => (window as unknown as SoundWindow).sirens.every(node => node.stopped))).toBe(true);
  await page.locator('#scrub').fill(String(end('siren').start + 100));
  await page.locator('#play').click();
  expect(await page.evaluate(() => (window as unknown as SoundWindow).sirens.length)).toBe(8);
  await page.locator('#mute').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as SoundWindow).soundContexts[0].state)).toBe('suspended');
  await page.locator('#scrub').fill(String(end('siren').start));
  await page.locator('#play').click();
  expect(await page.evaluate(() => (window as unknown as SoundWindow).sirens.length)).toBe(8);
});

test('an outgoing unanswered call emits two ringbacks and no police reply', async ({ page }) => {
  await page.addInitScript(() => {
    const browser = window as unknown as Window & { ringbacks: number[] }; browser.ringbacks = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      createOscillator(): OscillatorNode {
        const oscillator = super.createOscillator(), set = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (value, time) => { if (value === 425) browser.ringbacks.push(value); return set(value, time); };
        return oscillator;
      }
    };
  });
  await page.goto(`./#scene=bandit&t=${cue('unanswered').start / 1000}`);
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#start').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { ringbacks: number[] }).ringbacks)).toEqual([425, 425]);
  await page.locator('#play').click();
  await page.locator('#scrub').fill(String(cue('no-answer').end - 1));
  await expect(page.locator('#caption-typed')).toHaveText('Там не ответят.');
});
