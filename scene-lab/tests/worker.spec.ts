import { expect, test } from '@playwright/test';
import { scenes } from '../src/scenes.ts';
const scene = scenes.find(scene => scene.id === 'worker')!;
const cue = (id: string) => scene.cues.find(cue => cue.id === id)!;

test('worker thoughts stay ordinary until the flash reveals the stance before the calm final line', async ({ page }) => {
  await page.goto('./#scene=worker&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  for (const [id, text] of [['request', 'Мне к участковому.'], ['door', 'Так вот же дверь.'],
    ['reason', 'Я сам шёл к участковому.'], ['realization', 'Но даже туда меня не хотели пускать.'],
    ['inevitable', 'Придётся подвинуться.']]) {
    await page.locator('#scrub').fill(String(cue(id).end - 1));
    await expect(page.locator('#caption-typed')).toHaveText(text);
    await expect(page.locator('#fight')).toBeHidden();
  }
  await expect(page.locator('#art')).toHaveAttribute('src', /worker-ready-v2.webp$/);
  expect(await page.locator('#art').evaluate(el => el.style.transform)).toBe('scale(1)');
  await page.locator('#scrub').fill(String(cue('fight').start));
  await expect(page.locator('#fight')).toBeVisible();
  await expect(page.locator('#opponent')).toHaveText('РАБОЧЕГО');
});

test('the stance flash plays only while running and is suppressed by reduced motion', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto(`./#scene=worker&t=${cue('flash').start / 1000}`);
  await expect(page.locator('#start')).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.locator('#mute').click();
  await page.locator('#start').click();
  await page.clock.runFor(40);
  await expect(page.locator('#scene-flash')).toBeVisible();
  await expect(page.locator('#art')).toHaveAttribute('src', /worker-ready-v2.webp$/);
  await page.locator('#play').click();
  await expect(page.locator('#scene-flash')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#play').click();
  await page.clock.runFor(40);
  await expect(page.locator('#scene-flash')).toBeHidden();
  await page.clock.runFor(scene.duration);
  await expect(page.locator('#scrub')).toHaveValue(String(scene.duration));
  await page.locator('#play').click();
  await page.clock.runFor(100);
  await expect(page.locator('#art')).toHaveAttribute('src', /worker-wide-v2.webp$/);
});

test('worker links preserve the new thought, whole head and mobile captions after reload', async ({ page }) => {
  await page.goto(`./#scene=worker&t=${(cue('realization').end - 100) / 1000}`);
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#scrub').fill(String(cue('realization').end - 100));
  await page.locator('#share').click();
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#caption-typed')).toHaveText('Но даже туда меня не хотели пускать.');
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('#scrub').fill(String(cue('request').end - 1));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const head = await page.locator('#art').evaluate(el => {
      const image = el.getBoundingClientRect(), stage = el.parentElement!.getBoundingClientRect();
      return { top: image.top + image.height * .04 - stage.top, bottom: image.top + image.height * .24 - stage.top, height: stage.height };
    });
    expect(head.top).toBeGreaterThan(0);
    expect(head.bottom).toBeLessThan(head.height);
  }
});

test('missing final worker art blocks start and a valid scene recovers', async ({ page }) => {
  await page.route('**/art/worker-ready-v2.webp', route => route.abort());
  await page.goto('./#scene=worker&t=0');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await page.locator('#scene-select').selectOption('prologue');
  await expect(page.locator('#start')).toBeEnabled();
});
