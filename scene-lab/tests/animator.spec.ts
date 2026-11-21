import { expect, test } from '@playwright/test';
import { scenes } from '../src/scenes.ts';
const scene = scenes.find(scene => scene.id === 'animator')!;
const cue = (id: string) => scene.cues.find(cue => cue.id === id)!;

test('aftermath, memo and exit establish the route before the animator appears', async ({ page }) => {
  await page.goto('./#scene=animator&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  for (const [id, image, text] of [
    ['officer-aftermath', 'exit-v2', 'Он знал куда мне нужно, но не сказал.'],
    ['memo', 'memo-v2', 'Пришлось узнать самому.'], ['exit', 'exit-v2', 'Я направился в МФЦ.'],
    ['interruption', 'wide-v2', 'Но меня остановил ушастый зазывала.'],
  ]) {
    await page.locator('#scrub').fill(String(cue(id).end - 1));
    await expect(page.locator('#art')).toHaveAttribute('src', new RegExp(`animator-${image}.webp$`));
    await expect(page.locator('#caption-typed')).toHaveText(text);
  }
  await page.locator('#scrub').fill(String(cue('interruption').start + 1999));
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-solo-v1.webp$/);
  const partial = await page.locator('#caption-typed').textContent();
  await page.locator('#scrub').fill(String(cue('interruption').start + 2000));
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-wide-v2.webp$/);
  await expect(page.locator('#caption-typed')).toHaveText(partial!);
});

test('the leaflet is silent; nonreaction separates the first question from the mask gesture', async ({ page }) => {
  await page.goto('./#scene=animator&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  for (const at of [cue('leaflet').start, cue('leaflet').start + 1800, cue('leaflet').end - 1]) {
    await page.locator('#scrub').fill(String(at));
    await expect(page.locator('#subtitle')).toBeHidden();
    await expect(page.locator('#caption-typed')).toHaveText('');
    await expect(page.locator('#art')).toHaveAttribute('src', /animator-leaflet-v1.webp$/);
  }
  for (const [id, image, text] of [
    ['friend', 'wide', 'Моего друга убили.'], ['smile', 'wide', ''], ['command', 'wide', 'Тебе смешно?'],
    ['no-reaction', 'wide', ''], ['gesture', 'gesture', 'Я спросил: тебе смешно?'],
    ['raised-hand', 'gesture', 'Но он уже поднял на меня руку.'],
    ['forced', 'ready', 'Чем вынудил меня защищаться.'],
  ]) {
    await page.locator('#scrub').fill(String(cue(id).end - 1));
    await expect(page.locator('#art')).toHaveAttribute('src', new RegExp(`animator-${image}-v2.webp$`));
    await expect(page.locator('#caption-typed')).toHaveText(text);
    await expect(page.locator('#fight')).toBeHidden();
  }
  await expect(page.locator('[data-cue=innocent]')).toHaveCount(0);
});

test('a missing revised explanatory panel blocks start and repaired loading recovers', async ({ page }) => {
  await page.route('**/art/animator-gesture-v2.webp', (route) => route.abort());
  await page.goto('./#scene=animator&t=0');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#play')).toBeDisabled();
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('precinct');
  await expect(page.locator('#start')).toBeEnabled();
  await page.unroute('**/art/animator-gesture-v2.webp');
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('animator');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#scrub')).toHaveValue('0');
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-exit-v2.webp$/);
});

test('wide expression cut, direct links and narrow captions work with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#scene=animator&t=29');
  await expect(page.locator('#start')).toBeEnabled();
  const wide = await page.locator('#art').getAttribute('style');
  await page.getByRole('button', { name: 'Ссылка на этот момент' }).click();
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#scene-select')).toHaveValue('animator');
  await expect(page.locator('#scrub')).toHaveValue('29000');
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-gesture-v2.webp$/);
  await page.locator('#scrub').fill(String(cue('reaction').start));
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-ready-v2.webp$/);
  await expect(page.locator('#art')).toHaveAttribute('style', wide!);
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('#scrub').fill(String(cue('forced').end - 1));
    await expect(page.locator('#caption-typed')).toHaveText('Чем вынудил меня защищаться.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const stage = await page.locator('#stage').boundingBox(), subtitle = await page.locator('#subtitle').boundingBox();
    expect(subtitle!.x).toBeGreaterThanOrEqual(stage!.x);
    expect(subtitle!.x + subtitle!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  }
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`final art and fight title switch together with a short playback-only flash: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
    await page.goto(`./#scene=animator&t=${(cue('fight-flash').start - 100) / 1000}`);
    await expect(page.locator('#start')).toBeEnabled();
    await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
    await expect(page.locator('#art')).toHaveAttribute('src', /animator-ready-v2.webp$/);
    await expect(page.locator('#fight')).toBeHidden();
    await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
    await page.locator('#start').click();
    await page.clock.runFor(140);
    await expect(page.locator('#art')).toHaveAttribute('src', /animator-final-v2.webp$/);
    await expect(page.locator('#fight')).toBeVisible();
    await expect(page.locator('#scene-flash')).toBeVisible({ visible: reducedMotion === 'no-preference' });
    if (reducedMotion === 'no-preference') {
      const topLayer = await page.locator('#scene-flash').evaluate((flash) => {
        flash.style.pointerEvents = 'auto';
        const bounds = flash.getBoundingClientRect();
        const top = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.id;
        flash.style.pointerEvents = '';
        return top;
      });
      expect(topLayer).toBe('scene-flash');
    }
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await expect(page.locator('#scene-flash')).toBeHidden();
    await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
    await page.clock.runFor(160);
    await expect(page.locator('#scene-flash')).toBeHidden();
    await expect(page.locator('#fight')).toBeVisible();
    await page.locator('#scrub').fill(String(cue('fight-flash').start));
    await expect(page.locator('#scene-flash')).toBeHidden();
    await expect(page.locator('#fight')).toBeVisible();
  });
}
