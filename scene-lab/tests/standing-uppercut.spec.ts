import { expect, test, type Page } from '@playwright/test';

type Draw = { pose: number; time: number; x: number; y: number; scale: number; dx: number; dy: number };
type Recorded = Window & { risingDraws?: Draw[] };
async function begin(page: Page, training = true) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-26T09:00:00Z') });
  await page.addInitScript(() => {
    (window as Recorded).risingDraws = [];
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const arena = document.querySelector<HTMLCanvasElement>('#arena'), image = args[0];
        const match = image instanceof HTMLImageElement ? image.src.match(/boxer-(\d+)\.webp$/) : null;
        if (context.canvas === arena && match && arena?.dataset.playerAction === 'rising') {
          const m = context.getTransform();
          (window as Recorded).risingDraws!.push({ pose: Number(match[1]), time: Number(arena.dataset.playerActionTime), x: m.e, y: m.f, scale: m.a, dx: args[1], dy: args[2] });
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-26T10:00:00Z'));
  if (training) await page.locator('#training-mode').check();
  await page.locator('#start').click(); await page.clock.runFor(1800); await page.locator('#arena').focus();
}
async function punch(page: Page, up = 'ArrowUp') {
  await page.keyboard.down(up); await page.keyboard.press('j'); await page.keyboard.up(up);
}

test('W/ArrowUp plus J play the selected drawings with a vertical hop and no forward slide', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await begin(page);
  for (const up of ['w', 'ArrowUp']) {
    await page.evaluate(() => { (window as Recorded).risingDraws!.length = 0; });
    await punch(page, up); await page.clock.runFor(120);
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'rising');
    await expect(page.locator('#player-technique')).toContainText('АППЕРКОТ СТОЯ');
    if (up === 'w') await page.locator('.arena-shell').screenshot({ path: info.outputPath('standing-uppercut-contact.png') });
    await page.clock.runFor(500);
    const frames = await page.evaluate(() => (window as Recorded).risingDraws!);
    const sequence = frames.map(f => f.pose).filter((p, i, list) => i === 0 || p !== list[i - 1]);
    expect(sequence).toEqual([0, 14, 15, 14, 0]);
    expect(Math.min(...frames.map(f => f.y))).toBeLessThan(773);
    expect(frames.at(-1)!.y).toBe(820);
    for (const f of frames) {
      expect(f.x).toBe(430); expect(f.y).toBeGreaterThanOrEqual(772); expect(f.y).toBeLessThanOrEqual(820);
      expect(f.scale).toBeCloseTo(1.19, 6);
      if (f.pose === 0) expect(f.y).toBe(820);
      if (f.time > .04 && f.time < .24) expect(f.y).toBeLessThan(820);
      if (f.pose === 14 || f.pose === 15) { expect(f.dx).toBe(-228); expect(f.dy).toBe(-525); }
      if (f.pose === 15) { expect(f.time).toBeGreaterThanOrEqual(.08 - 1e-8); expect(f.time).toBeLessThan(.22); }
    }
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
    await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
  }
  await page.keyboard.down('s'); await page.keyboard.press('k'); await page.keyboard.up('s'); await page.clock.runFor(20);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'upper'); await page.clock.runFor(800);
  await page.keyboard.down('w'); await page.keyboard.press('k'); await page.keyboard.up('w'); await page.clock.runFor(20);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'overhand');
  expect(errors).toEqual([]);
});

test('touch up then light works with the release buffer and holding J never repeats the move', async ({ page }, info) => {
  await begin(page);
  if (info.project.name === 'mobile') await page.locator('[data-input=up]').tap(); else await page.keyboard.press('w');
  await page.clock.runFor(60);
  if (info.project.name === 'mobile') await page.locator('[data-input=light]').tap(); else await page.keyboard.press('j');
  await page.clock.runFor(100); await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'rising');
  await page.clock.runFor(600); await page.locator('#arena').focus();
  await page.keyboard.down('w'); await page.keyboard.down('j'); await page.clock.runFor(900);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
  await page.keyboard.up('j'); await page.keyboard.up('w'); await page.clock.runFor(200);
  await page.keyboard.press('j'); await page.clock.runFor(20);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'jab');
});

test('a real hit launches once; hitstop, pause and training save/load keep the contact and editor exposes both new poses', async ({ page }, info) => {
  await begin(page); const arena = page.locator('#arena');
  await page.keyboard.down('d'); await page.clock.runFor(1550); await page.keyboard.up('d');
  const x = await arena.getAttribute('data-player-x'); await page.locator('#hitboxes').check(); await arena.focus();
  await punch(page); await page.clock.runFor(110);
  await expect(page.locator('#worker-hp')).toHaveText('97 / 120');
  expect(Number(await arena.getAttribute('data-player-stop'))).toBeGreaterThan(0);
  expect(await arena.getAttribute('data-player-x')).toBe(x);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('standing-uppercut-hitboxes.png') });
  await page.locator('#training-freeze').click(); await page.locator('#training-save').click();
  const time = await arena.getAttribute('data-player-action-time');
  const height = await arena.getAttribute('data-player-y'); expect(Number(height)).toBeGreaterThan(0);
  const pixels = await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.clock.runFor(250); expect(await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(pixels);
  await page.locator('#training-freeze').click(); await page.clock.runFor(400);
  expect(Number(await arena.getAttribute('data-worker-y'))).toBeGreaterThan(0);
  await page.locator('#training-load').click(); await expect(arena).toHaveAttribute('data-player-action', 'rising');
  expect(await arena.getAttribute('data-player-action-time')).toBe(time);
  expect(await arena.getAttribute('data-player-y')).toBe(height);
  await page.locator('#training-freeze').click(); await arena.focus(); await page.keyboard.press('Escape');
  await page.clock.runFor(200); expect(await arena.getAttribute('data-player-action-time')).toBe(time);
  await page.locator('#resume').click(); await page.clock.runFor(700);
  await page.locator('#edit-attack').selectOption('rising'); await expect(page.locator('#edit-phase option')).toHaveCount(5);
  await expect(page.locator('#edit-pose')).toHaveAttribute('max', '19');
  await page.locator('#edit-phase').selectOption('1'); await expect(page.locator('#edit-pose')).toHaveValue('14');
  await page.locator('#edit-phase').selectOption('2'); await expect(page.locator('#edit-pose')).toHaveValue('15');
  await expect(page.locator('#edit-right')).toHaveValue('175');
  await expect(page.locator('#edit-bottom')).toHaveValue('400');
  expect(Number(await arena.getAttribute('data-player-y'))).toBeGreaterThan(30);
  await page.locator('#edit-attack').selectOption('poke'); await expect(page.locator('#edit-pose')).toHaveAttribute('max', '11');
});

test('up+J also works in a regular fight and missing new art reports a retryable error', async ({ page }) => {
  await begin(page, false); await punch(page); await page.clock.runFor(120);
  await expect(page.locator('#arena')).toHaveAttribute('data-training', 'false');
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'rising');
  let missing = true;
  await page.route('**/art/fight/boxer-15.webp', async route => { if (missing) await route.abort(); else await route.continue(); });
  await page.goto('./fight.html'); await expect(page.locator('#load-status')).toContainText('boxer-15.webp');
  await expect(page.locator('#start')).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ');
  missing = false; await page.locator('#start').click(); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});
