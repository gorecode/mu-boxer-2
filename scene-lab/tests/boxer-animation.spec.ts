import { expect, test } from '@playwright/test';

test('boxer keeps his ground anchor and facing through attacks, walk, recovery and pause', async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    type Sample = { pose: number; a: number; b: number; c: number; d: number; x: number; y: number };
    const samples: Sample[] = []; (window as Window & { boxerFrames?: Sample[] }).boxerFrames = samples;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const image = args[0];
        if (image instanceof HTMLImageElement && /(?:boxer-|jab\/jab-)\d+\.webp$/.test(image.src)) {
          const m = context.getTransform();
          samples.push({ pose: Number(image.src.match(/(?:boxer-|jab-)(\d+)/)![1]), a: m.a, b: m.b, c: m.c, d: m.d, x: m.e, y: m.f });
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.clock.install({ time: new Date('2026-11-21T09:00:00Z') });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-21T10:00:00Z'));
  await page.locator('#training-mode').check(); await page.locator('#start').click(); await page.clock.runFor(1800);
  const arena = page.locator('#arena');
  async function sample() {
    return page.evaluate(() => (window as Window & { boxerFrames?: { pose: number; a: number; b: number; c: number; d: number; x: number; y: number }[] }).boxerFrames!.at(-1)!);
  }
  for (const kind of ['jab', 'cross', 'heavy', 'long', 'backfist', 'overhand', 'low', 'upper']) {
    await page.locator('#edit-attack').selectOption(kind);
    for (const phase of ['0', '1', '2', '3']) {
      await page.locator('#edit-phase').selectOption(phase);
      const frame = await sample();
      expect(frame.a).toBeGreaterThan(1); expect(frame.a).toBe(frame.d);
      expect(frame.b).toBe(0); expect(frame.c).toBe(0);
      expect(frame.x).toBeCloseTo(Number(await arena.getAttribute('data-player-x')), 1);
      expect(frame.y).toBeCloseTo(820 - Number(await arena.getAttribute('data-player-y')), 1);
    }
  }
  await arena.focus(); await page.keyboard.press('r'); await page.clock.runFor(1800);
  await page.evaluate(() => { (window as Window & { boxerFrames?: unknown[] }).boxerFrames!.length = 0; });
  await page.keyboard.down('d'); await page.clock.runFor(800); await page.keyboard.up('d');
  const poses = await page.evaluate(() => [...new Set((window as Window & { boxerFrames?: { pose: number }[] }).boxerFrames!.map(f => f.pose))]);
  expect(poses.sort()).toEqual([0, 1]);
  await page.keyboard.press('Escape');
  const before = await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL()); await page.clock.runFor(500);
  expect(await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('boxer-stable-footwork.png') });
});
