import { expect, test, type Page } from '@playwright/test';

type Draw = { pose: number; scale: number; dx: number; dy: number };
type Recorded = Window & { workerMoveDraws?: Draw[] };
async function begin(page: Page, training = true) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-11-28T09:00:00Z') });
  await page.addInitScript(() => {
    (window as Recorded).workerMoveDraws = [];
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const im = args[0], arena = document.querySelector('#arena');
        if (context.canvas === arena && im instanceof HTMLImageElement) {
          const match = im.src.match(/worker-(\d+)\.webp$/);
          if (match) (window as Recorded).workerMoveDraws!.push({ pose: Number(match[1]), scale: context.getTransform().a, dx: args[1], dy: args[2] });
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-28T10:00:00Z'));
  if (training) await page.locator('#training-mode').check();
  await page.locator('#start').click(); await page.clock.runFor(1800);
}
const num = async (page: Page, key: string) => Number(await page.locator('#arena').getAttribute(`data-${key}`));
const draws = (page: Page) => page.evaluate(() => (window as Recorded).workerMoveDraws!);

test('shove editor shows exact selected pose and real hit, pause and snapshot do not duplicate it', async ({ page }, info) => {
  await begin(page); const arena = page.locator('#arena');
  await page.locator('#edit-attack').selectOption('shove'); await page.locator('#edit-phase').selectOption('1');
  await expect(arena).toHaveAttribute('data-worker-action', 'shove'); await expect(arena).toHaveAttribute('data-player-action', '');
  await expect(page.locator('#edit-pose')).toHaveValue('12'); await expect(page.locator('#edit-pose')).toHaveAttribute('max', '12');
  const selected = (await draws(page)).filter(d => d.pose === 12);
  expect(selected.length).toBeGreaterThan(0);
  for (const d of selected) { expect(d.dx).toBe(-228); expect(d.dy).toBe(-525); expect(d.scale).toBeCloseTo(1.22, 6); }
  await page.locator('#edit-pose').fill('13'); await page.locator('#edit-pose').press('Tab');
  await expect(page.locator('#training-status')).toContainText('Недопустимые'); await expect(page.locator('#edit-pose')).toHaveValue('12');
  await page.locator('#edit-phase').selectOption('0'); await page.locator('#training-freeze').click();
  await page.clock.runFor(260); await expect(page.locator('#player-hp')).toHaveText('92 / 100');
  await expect(arena).toHaveAttribute('data-worker-contacts', '0'); expect(await num(page, 'worker-stop')).toBeGreaterThan(0);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('worker-shove-contact.png') });
  await arena.focus(); await page.keyboard.press('Escape');
  const time = await num(page, 'worker-action-time'), x = await num(page, 'player-x');
  await page.clock.runFor(500); expect(await num(page, 'worker-action-time')).toBe(time); expect(await num(page, 'player-x')).toBe(x);
  await page.locator('#resume').click(); await page.locator('#training-save').click();
  await page.clock.runFor(1500); await expect(arena).toHaveAttribute('data-worker-action', '');
  expect(await num(page, 'player-x')).toBeLessThan(x - 190);
  await page.locator('#training-load').click(); await page.locator('#training-freeze').click(); await page.clock.runFor(1500);
  await expect(page.locator('#player-hp')).toHaveText('92 / 100'); await expect(arena).toHaveAttribute('data-worker-action', '');
});

test('real keyboard changes from low guard to standing guard between the two worker contacts', async ({ page }, info) => {
  await begin(page); const arena = page.locator('#arena');
  await page.locator('#edit-attack').selectOption('lowHigh'); await page.locator('#edit-phase').selectOption('0');
  await page.locator('#training-freeze').click(); await arena.focus();
  await page.keyboard.down('s'); await page.keyboard.down('l'); await page.clock.runFor(500);
  await expect(arena).toHaveAttribute('data-worker-contacts', '0'); await expect(page.locator('#player-hp')).toHaveText('100 / 100');
  for (let i = 0; i < 10 && await num(page, 'worker-action-time') < .56; i++) await page.clock.runFor(25);
  await expect(page.locator('#fight-hint')).toContainText('ВСТАНЬ В БЛОК');
  await page.keyboard.up('s'); await page.clock.runFor(30);
  await expect(page.locator('#guard-state')).toContainText('СТОЯ');
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('worker-low-high-upper-telegraph.png') });
  await page.clock.runFor(500);
  await expect(arena).toHaveAttribute('data-worker-contacts', '0,1'); await expect(page.locator('#player-hp')).toHaveText('100 / 100');
  expect(await num(page, 'player-guard')).toBe(50);
  const poses = (await draws(page)).map(d => d.pose);
  for (const pose of [7, 9, 3, 8]) expect(poses).toContain(pose);
  await page.keyboard.up('l'); await page.clock.runFor(650); await expect(arena).toHaveAttribute('data-worker-action', '');
});

test('actual CPU approaches and independently performs both new attacks without actor state injection', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await begin(page); await page.locator('#training-dummy').selectOption('cpu');
  const seen = new Set<string>(), x = await num(page, 'worker-x');
  for (let i = 0; i < 220 && !(seen.has('shove') && seen.has('lowHigh')); i++) {
    await page.clock.runFor(100);
    seen.add((await page.locator('#arena').getAttribute('data-worker-action')) ?? '');
  }
  expect([...seen]).toEqual(expect.arrayContaining(['shove', 'lowHigh']));
  expect(await num(page, 'worker-x')).toBeLessThan(x - 100);
  await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
  expect((await draws(page)).some(d => d.pose === 12)).toBe(true);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('worker-cpu-new-moves.png') });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('missing new drawing and incomplete manifest gate startup and recover; normal fight really advances', async ({ page }) => {
  await page.route('**/art/fight/worker-12.webp', route => route.abort());
  await page.goto('./fight.html'); await expect(page.locator('#load-status')).toContainText('worker-12.webp');
  await expect(page.locator('#start')).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ');
  await page.unroute('**/art/fight/worker-12.webp'); await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.route('**/art/fight/manifest.json', async route => {
    const response = await route.fetch(), manifest = await response.json();
    manifest.worker.pop(); await route.fulfill({ response, json: manifest });
  });
  await page.reload(); await expect(page.locator('#load-status')).toContainText('Повреждён');
  await page.unroute('**/art/fight/manifest.json');
  await page.clock.install({ time: new Date('2026-11-28T09:00:00Z') });
  await page.locator('#start').click(); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-28T10:00:00Z'));
  await page.locator('#start').click(); await page.clock.runFor(2500);
  await expect(page.locator('#arena')).toHaveAttribute('data-training', 'false');
  expect(await num(page, 'worker-x')).toBeLessThan(1170);
  await page.clock.runFor(3000); expect(Number((await page.locator('#player-hp').textContent())!.split('/')[0])).toBeLessThan(100);
});
