import { expect, test } from '@playwright/test';
import { scenes } from '../src/scenes.ts';
import { compileFilm } from '../src/film.ts';

const film = compileFilm(scenes);

test('film mode plays through every chapter boundary and fight card after one initial start', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./#scene=film&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#mode-select')).toHaveValue('film');
  await expect(page.locator('#scene-select')).toHaveValue('intro');
  await expect(page.locator('#scrub')).toHaveAttribute('max', String(film.scene.duration));
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.locator('#mute').click();
  await page.locator('#start').click();
  await page.clock.runFor(100);
  await expect(page.locator('#start-overlay')).toBeHidden();
  for (const chapter of film.chapters.slice(1)) {
    await page.locator('#scrub').fill(String(chapter.start - 50));
    await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
    await page.clock.runFor(100);
    await expect(page.locator('#scene-select')).toHaveValue(chapter.scene.id);
    await expect(page.locator('#title')).toHaveText(chapter.scene.title);
    await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
    await expect(page.locator('#start-overlay')).toBeHidden();
    await expect(page.locator('#fight')).toBeHidden();
    await expect(page.locator('#stage')).toHaveClass(chapter.scene.hardCuts ? /hard-cuts/ : /^stage$/);
  }
  await page.locator('#scrub').fill(String(film.scene.duration - 50));
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await page.clock.runFor(100);
  await expect(page.locator('#scrub')).toHaveValue(String(film.scene.duration));
  await expect(page.locator('#title-card-title')).toHaveText('КОНЕЦ');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
  await page.clock.runFor(500);
  await expect(page.locator('#scrub')).toHaveValue(String(film.scene.duration));
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await page.clock.runFor(100);
  await expect(page.locator('#scene-select')).toHaveValue('intro');
  await expect(page.locator('#title-card')).toBeHidden();
});

test('mode and chapter selectors preserve speed, pause audio and share global positions without autoplay', async ({ page }) => {
  await page.goto('./#scene=bandit&t=17');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#speed').selectOption('2');
  await page.locator('#start').click();
  await page.locator('#mode-select').selectOption('film');
  await expect(page.locator('#scrub')).toHaveValue('0');
  await expect(page.locator('#start-overlay')).toBeVisible();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
  await expect(page.locator('#speed')).toHaveValue('2');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#scene-select').selectOption('bandit');
  const chapter = film.chapters.find(chapter => chapter.scene.id === 'bandit')!;
  await expect(page.locator('#scrub')).toHaveValue(String(chapter.start));
  await page.locator('#scrub').fill(String(chapter.start + chapter.scene.cues.find(cue => cue.id === 'no-answer')!.end - 1));
  await expect(page.locator('#caption-typed')).toHaveText('Там не ответят.');
  await expect(page.locator('#art')).toHaveAttribute('src', /bandit-phone-v1.webp$/);
  await page.locator('#share').click();
  expect(page.url()).toContain('#scene=film&t=');
  const url = page.url();
  const sharedTime = Number(new URLSearchParams(new URL(url).hash.slice(1)).get('t')) * 1000;
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page).toHaveURL(url);
  await expect(page.locator('#mode-select')).toHaveValue('film');
  await expect(page.locator('#scene-select')).toHaveValue('bandit');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
  await page.locator('#speed').selectOption('2');
  await page.locator('#mode-select').selectOption('scene');
  await expect(page.locator('#scene-select')).toHaveValue('bandit');
  await expect(page.locator('#scrub')).toHaveValue(String(Math.round(sharedTime) - chapter.start));
  await expect(page.locator('#speed')).toHaveValue('2');
  await expect(page.locator('#start-overlay')).toBeVisible();
});

test('film keeps audio active and schedules the next chapter voice rather than stopping at its boundary', async ({ page }) => {
  await page.addInitScript(() => {
    const browser = window as unknown as Window & { filmContexts: AudioContext[] };
    browser.filmContexts = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor() { super(); browser.filmContexts.push(this); }
    };
  });
  const next = film.chapters.find(chapter => chapter.scene.id === 'epilogue')!;
  await page.goto(`./#scene=film&t=${(next.start - 100) / 1000}`);
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#start').click();
  await expect(page.locator('#scene-select')).toHaveValue('epilogue');
  await expect(page.locator('#caption-typed')).not.toHaveText('');
  expect(await page.evaluate(() => (window as unknown as Window & { filmContexts: AudioContext[] }).filmContexts.map(context => context.state))).toEqual(['running']);
  await expect(page.locator('#resolve')).toBeHidden();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { filmContexts: AudioContext[] }).filmContexts[0].state)).toBe('suspended');
  const paused = await page.locator('#scrub').inputValue();
  await page.waitForTimeout(100);
  await expect(page.locator('#scrub')).toHaveValue(paused);
});

test('a late film asset failure blocks playback and switching back to a valid single scene recovers', async ({ page }) => {
  await page.route('**/art/epilogue-exit-v2.webp', route => route.abort());
  await page.goto('./#scene=film&t=0');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#play')).toBeDisabled();
  await page.locator('#mode-select').selectOption('scene');
  await expect(page.locator('#scene-select')).toHaveValue('intro');
  await expect(page.locator('#start')).toBeEnabled();
  await page.unroute('**/art/epilogue-exit-v2.webp');
  await page.locator('#mode-select').selectOption('film');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#status')).not.toContainText('Не удалось');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a single uninterrupted film play reaches all ten chapters and stops at the epilogue end', async ({ page }) => {
  test.setTimeout(60000);
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./#scene=film&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.evaluate(() => {
    const browser = window as unknown as Window & { playedTitles: string[] };
    const title = document.querySelector('#title')!;
    browser.playedTitles = [title.textContent!];
    new MutationObserver(() => browser.playedTitles.push(title.textContent!)).observe(title, { childList: true, characterData: true, subtree: true });
  });
  await page.locator('#mute').click();
  await page.locator('#speed').selectOption('2');
  await page.locator('#start').click();
  await page.clock.runFor(Math.ceil(film.scene.duration / 2) + 100);
  await expect(page.locator('#scrub')).toHaveValue(String(film.scene.duration));
  await expect(page.locator('#title-card-title')).toHaveText('КОНЕЦ');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
  expect(await page.evaluate(() => (window as unknown as Window & { playedTitles: string[] }).playedTitles)).toEqual(scenes.map(scene => scene.title));
});
