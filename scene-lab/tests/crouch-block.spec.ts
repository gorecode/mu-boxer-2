import { expect, test, type Page } from '@playwright/test';

type Draw = { pose: number; x: number; y: number; sx: number; sy: number; dx: number; dy: number };
type Recorded = Window & { guardDraws?: Draw[] };
async function begin(page: Page, training = true) {
  await page.emulateMedia({ reducedMotion: training ? 'reduce' : 'no-preference' });
  await page.clock.install({ time: new Date('2026-11-27T09:00:00Z') });
  await page.addInitScript(() => {
    (window as Recorded).guardDraws = [];
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const match = args[0] instanceof HTMLImageElement ? args[0].src.match(/boxer-(\d+)\.webp$/) : null;
        if (context.canvas.id === 'arena' && match) {
          const m = context.getTransform();
          (window as Recorded).guardDraws!.push({ pose: Number(match[1]), x: m.e, y: m.f, sx: m.a, sy: m.d, dx: args[1], dy: args[2] });
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-27T10:00:00Z'));
  if (training) await page.locator('#training-mode').check();
  await page.locator('#start').click(); await page.clock.runFor(1800); await page.locator('#arena').focus();
}
async function latest(page: Page) {
  return page.evaluate(() => (window as Recorded).guardDraws!.at(-1)!);
}

test('keyboard low guard uses exact selected frame in both directions and releases to crouch or standing guard', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await begin(page);
  for (const mirror of [false, true]) {
    if (mirror) {
      await page.keyboard.down('d'); await page.clock.runFor(1700);
      await page.keyboard.press('Space'); await page.clock.runFor(1100); await page.keyboard.up('d');
      await expect(page.locator('#arena')).toHaveAttribute('data-player-facing', '-1');
    }
    await page.keyboard.down('s'); await page.clock.runFor(30); expect((await latest(page)).pose).toBe(5);
    const root = (await latest(page)).x;
    await page.keyboard.down('l'); await page.clock.runFor(100);
    const guard = await latest(page);
    expect(guard.pose).toBe(25); expect(guard.x).toBe(root); expect(guard.y).toBe(820);
    expect(guard.sx).toBeCloseTo(mirror ? -1.19 : 1.19, 6); expect(guard.sy).toBeCloseTo(1.19, 6);
    expect(guard.dx).toBe(-228); expect(guard.dy).toBe(-525);
    await expect(page.locator('#arena')).toHaveAttribute('data-player-block', 'low');
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`low-guard-${mirror ? 'left' : 'right'}.png`) });
    await page.keyboard.up('l'); await page.clock.runFor(30); expect((await latest(page)).pose).toBe(5);
    await page.keyboard.down('l'); await page.clock.runFor(30); expect((await latest(page)).pose).toBe(25);
    await page.keyboard.up('s'); await page.clock.runFor(30); expect((await latest(page)).pose).toBe(4);
    await page.keyboard.up('l'); await page.clock.runFor(30); expect((await latest(page)).pose).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('two real touch contacts hold down plus block and release independently', async ({ page }, info) => {
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 640, height: 900 });
  await begin(page);
  const down = page.locator('[data-input=down]'), block = page.locator('[data-input=block]');
  await block.scrollIntoViewIfNeeded();
  const a = (await down.boundingBox())!, b = (await block.boundingBox())!;
  const touches = [{ x: a.x + a.width / 2, y: a.y + a.height / 2, id: 1 }, { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 }];
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touches[0]] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
  await page.clock.runFor(100); expect((await latest(page)).pose).toBe(25);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-block', 'low');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [touches[0]] });
  await page.clock.runFor(30); expect((await latest(page)).pose).toBe(4);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(30); expect((await latest(page)).pose).toBe(0);
});

test('normal fight renders A with motion enabled and old asset categories still draw', async ({ page }, info) => {
  await begin(page, false);
  await page.keyboard.down('s'); await page.keyboard.down('l'); await page.clock.runFor(100);
  expect((await latest(page)).pose).toBe(25);
  await expect(page.locator('#arena')).toHaveAttribute('data-training', 'false');
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('low-guard-normal-fight.png') });
  await page.keyboard.up('l'); await page.keyboard.up('s');
});

test('missing A blocks startup and retries; a manifest without its frame is rejected', async ({ page }) => {
  let missing = true;
  await page.route('**/art/fight/boxer-25.webp', route => missing ? route.abort() : route.continue());
  await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toContainText('boxer-25.webp');
  await expect(page.locator('#start')).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ');
  await expect(page.locator('#arena')).toHaveAttribute('data-loaded', 'false');
  missing = false; await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.route('**/art/fight/manifest.json', async route => {
    const response = await route.fetch(), manifest = await response.json(); manifest.boxer.pop();
    await route.fulfill({ response, json: manifest });
  });
  await page.reload(); await expect(page.locator('#load-status')).toHaveText('Повреждён список поз бойцов.');
});
