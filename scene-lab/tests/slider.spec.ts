import { expect, test } from '@playwright/test';

test('slider stays paused initially, freezes camera and speech, ends at 2x and replays', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./#scene=slider&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#title')).toHaveText('На этот раз я готов');
  await expect(page.locator('#art')).toHaveAttribute('src', /slider-aftermath-v1.webp$/);
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.clock.runFor(500);
  await expect(page.locator('#scrub')).toHaveValue('0');
  await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
  await page.locator('#start').click();
  await page.clock.runFor(1200);
  const partial = await page.locator('#caption-typed').textContent();
  expect(partial!.length).toBeGreaterThan(0);
  expect(partial!.length).toBeLessThan('Я продолжил свой путь.'.length);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const paused = await page.locator('#scrub').inputValue(), camera = await page.locator('#art').getAttribute('style');
  await page.clock.runFor(500);
  await expect(page.locator('#scrub')).toHaveValue(paused);
  await expect(page.locator('#art')).toHaveAttribute('style', camera!);
  await expect(page.locator('#caption-typed')).toHaveText(partial!);
  await page.locator('#speed').selectOption('2');
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await page.clock.runFor(17000);
  await expect(page.locator('#scrub')).toHaveValue('34400');
  await expect(page.locator('#fight')).toBeVisible();
  await expect(page.locator('#opponent')).toHaveText('НЕФОРМАЛА');
  await expect(page.locator('#art')).toHaveAttribute('src', /slider-final-v1.webp$/);
  await expect(page.locator('#scene-flash')).toBeHidden();
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await page.clock.runFor(100);
  await expect(page.locator('#fight')).toBeHidden();
  await expect(page.locator('#art')).toHaveAttribute('src', /slider-aftermath-v1.webp$/);
});

test('slider staging survives direct seeking and shares the thinking pause without early final art', async ({ page }) => {
  await page.goto('./#scene=slider&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  for (const [time, image, text] of [
    ['3999', 'aftermath', 'Я продолжил свой путь.'], ['4000', 'passage', ''],
    ['7799', 'passage', 'До МФЦ оставалось перейти дорогу.'], ['7800', 'slide', ''],
    ['11699', 'slide', 'Но тут мне бросились под ноги.'], ['11700', 'dialogue', ''],
    ['14899', 'dialogue', 'Ты чего под ноги бросаешься?'], ['18099', 'dialogue', 'Кошмарим нормисов на камеру!'],
    ['18100', 'dialogue', ''], ['18749', 'dialogue', ''],
    ['22199', 'dialogue', 'Я к тебе нормально обратился.'], ['22200', 'dialogue', ''],
    ['28099', 'runup', 'Он собирался повторить.'], ['28100', 'angry', ''],
    ['31899', 'angry', 'На этот раз я готов.'],
  ]) {
    await page.locator('#scrub').fill(time);
    await expect(page.locator('#art')).toHaveAttribute('src', new RegExp(`slider-${image}-v1.webp$`));
    await expect(page.locator('#caption-typed')).toHaveText(text);
    await expect(page.locator('#fight')).toBeHidden();
  }
  await page.locator('#scrub').fill('31900');
  await expect(page.locator('#art')).toHaveAttribute('src', /slider-final-v1.webp$/);
  await expect(page.locator('#fight')).toBeVisible();
  await expect(page.locator('#scene-flash')).toBeHidden();
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('animator');
  await expect(page.locator('#scrub')).toHaveValue('0');
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-exit-v2.webp$/);
});

test('a failed new illustration blocks playback and selection retries recover', async ({ page }) => {
  await page.route('**/art/slider-slide-v1.webp', (route) => route.abort());
  await page.goto('./#scene=slider&t=0');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#play')).toBeDisabled();
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('animator');
  await expect(page.locator('#start')).toBeEnabled();
  await page.unroute('**/art/slider-slide-v1.webp');
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('slider');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#scrub')).toHaveValue('0');
});

test('reduced motion keeps disclosure readable, links survive reload and mobile captions stay inside the frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#scene=slider&t=1.2');
  await expect(page.locator('#start')).toBeEnabled();
  const close = await page.locator('#art').getAttribute('style');
  await page.locator('#scrub').fill('2099');
  await expect(page.locator('#art')).toHaveAttribute('style', close!);
  await page.locator('#scrub').fill('2100');
  expect(await page.locator('#art').getAttribute('style')).not.toBe(close);
  await page.getByRole('button', { name: 'Ссылка на этот момент' }).click();
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#scene-select')).toHaveValue('slider');
  await expect(page.locator('#scrub')).toHaveValue('2100');
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('#scrub').fill('31899');
    await expect(page.locator('#caption-typed')).toHaveText('На этот раз я готов.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const stage = await page.locator('#stage').boundingBox(), subtitle = await page.locator('#subtitle').boundingBox();
    expect(subtitle!.x).toBeGreaterThanOrEqual(stage!.x);
    expect(subtitle!.x + subtitle!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  }
  await page.locator('#scrub').fill('31900');
  await expect(page.locator('#scene-flash')).toBeHidden();
  await expect(page.locator('#fight')).toBeVisible();
});

test('the new slide disclosure moves during speech; the repeat preparation follows the camera instruction', async ({ page }) => {
  await page.goto('./#scene=slider&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#scrub').fill('8350');
  const close = await page.locator('#art').getAttribute('style');
  await page.locator('#scrub').fill('9200');
  expect(await page.locator('#art').getAttribute('style')).not.toBe(close);
  await expect(page.locator('#caption-typed')).not.toHaveText('');
  await page.locator('#scrub').fill('10100');
  expect(await page.locator('#art').evaluate(el => el.style.transform)).toBe('scale(1)');
  await page.locator('#scrub').fill('24799');
  await expect(page.locator('#caption-typed')).toHaveText('Камеру не выключай.');
  await expect(page.locator('#art')).toHaveAttribute('src', /slider-dialogue-v1.webp$/);
  await page.locator('#scrub').fill('25299');
  await expect(page.locator('#subtitle')).toBeHidden();
  await expect(page.locator('#art')).toHaveAttribute('src', /slider-dialogue-v1.webp$/);
  await page.locator('#scrub').fill('25300');
  await expect(page.locator('#art')).toHaveAttribute('src', /slider-runup-v1.webp$/);
});
