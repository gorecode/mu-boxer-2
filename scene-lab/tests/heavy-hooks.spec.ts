import { expect, test, type Page } from '@playwright/test';

type Draw = { pose: number; time: number; x: number; y: number; scale: number; dx: number; dy: number; hand: string };
type Recorded = Window & { hookDraws?: Draw[] };

async function begin(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-24T09:00:00Z') });
  await page.addInitScript(() => {
    const frames: Draw[] = []; (window as Recorded).hookDraws = frames;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const image = args[0], arena = document.querySelector<HTMLCanvasElement>('#arena');
        const match = image instanceof HTMLImageElement ? image.src.match(/boxer-(\d+)\.webp$/) : null;
        if (match && arena?.dataset.playerAction === 'heavy') {
          const t = context.getTransform();
          frames.push({ pose: Number(match[1]), time: Number(arena.dataset.playerActionTime), hand: arena.dataset.playerHand ?? '',
            x: t.e, y: t.f, scale: t.a, dx: args[1], dy: args[2] });
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-24T10:00:00Z'));
  await page.locator('#training-mode').check(); await page.locator('#start').click(); await page.clock.runFor(1800);
  await page.locator('#arena').focus();
}

test('K and touch heavy alternate the selected two-drawing hooks with fixed registration and a clean return', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await begin(page);
  for (const [hand, pose] of [['left',12],['right',13]] as const) {
    await page.evaluate(() => { (window as Recorded).hookDraws!.length = 0; });
    if (info.project.name === 'mobile') await page.locator('[data-input=heavy]').tap();
    else await page.keyboard.press('k');
    await page.clock.runFor(280);
    await expect(page.locator('#arena')).toHaveAttribute('data-player-hand', hand);
    await expect(page.locator('#player-technique')).toContainText(hand === 'left' ? 'ЛЕВЫЙ БОКОВОЙ' : 'ПРАВЫЙ БОКОВОЙ');
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`hook-${hand}.png`) });
    await page.clock.runFor(120);
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'heavy');
    await page.clock.runFor(400);
    const frames = await page.evaluate(() => (window as Recorded).hookDraws!);
    const sequence = frames.map(f => f.pose).filter((pose,i,list) => i === 0 || pose !== list[i-1]);
    expect(sequence).toEqual([0,pose,0]);
    const contacts = frames.filter(f => f.pose === pose); expect(contacts.length).toBeGreaterThan(0);
    for (const f of contacts) {
      expect(f.time).toBeGreaterThanOrEqual(.25 - 1e-8); expect(f.time).toBeLessThan(.37);
      expect(f.dx).toBe(-228); expect(f.dy).toBe(-495); expect(f.scale).toBeCloseTo(1.19,6);
      expect(f.x).toBeCloseTo(430,1); expect(f.y).toBe(820);
    }
    await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
  }
  await page.locator('#arena').focus(); await page.keyboard.press('r'); await page.clock.runFor(1800);
  await page.keyboard.press('k'); await page.clock.runFor(280);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-hand','left');
  expect(errors).toEqual([]);
});

test('an actual hook hit freezes the contact; training save/load and pause preserve the selected hand', async ({ page }, info) => {
  await begin(page); const arena = page.locator('#arena');
  await page.keyboard.down('d'); await page.clock.runFor(1450); await page.keyboard.up('d');
  await page.locator('#hitboxes').check(); await arena.focus(); await page.keyboard.press('k'); await page.clock.runFor(280);
  await expect(page.locator('#worker-hp')).toHaveText('100 / 120');
  expect(Number(await arena.getAttribute('data-player-stop'))).toBeGreaterThan(0);
  await page.locator('#training-freeze').click(); await page.locator('#training-save').click();
  const time = await arena.getAttribute('data-player-action-time');
  const before = await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.clock.runFor(300);
  expect(await arena.getAttribute('data-player-action-time')).toBe(time);
  expect(await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('hook-hitboxes.png') });
  await page.locator('#training-freeze').click(); await page.clock.runFor(800);
  await arena.focus(); await page.keyboard.press('k'); await page.clock.runFor(280);
  await expect(arena).toHaveAttribute('data-player-hand','right');
  await page.locator('#training-load').click();
  await expect(arena).toHaveAttribute('data-player-hand','left');
  expect(await arena.getAttribute('data-player-action-time')).toBe(time);
  await page.locator('#training-freeze').click(); await arena.focus(); await page.keyboard.press('Escape');
  await page.clock.runFor(300); expect(await arena.getAttribute('data-player-action-time')).toBe(time);
  await page.locator('#resume').click(); await page.clock.runFor(800);
  await page.keyboard.press('k'); await page.clock.runFor(280);
  await expect(arena).toHaveAttribute('data-player-hand','right');
});

test('a missing right-hook texture reports its name and can be retried', async ({ page }) => {
  let missing = true;
  await page.route('**/art/fight/boxer-13.webp', async route => { if (missing) await route.abort(); else await route.continue(); });
  await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toContainText('boxer-13.webp');
  await expect(page.locator('#start')).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ');
  missing = false; await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});
