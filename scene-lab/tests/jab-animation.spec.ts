import { expect, test } from '@playwright/test';

test('new jab draws transparent registered frames, holds contact and restores the standing pose', async ({ page }, info) => {
  await page.addInitScript(() => {
    const frames: { frame: number; time: number; x: number; y: number; a: number; d: number }[] = [];
    (window as Window & { jabFrames?: typeof frames }).jabFrames = frames;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const image = args[0];
        if (image instanceof HTMLImageElement && /\/jab\/jab-\d\.webp$/.test(image.src)) {
          const t = context.getTransform();
          frames.push({ frame: Number(image.src.match(/jab-(\d)/)![1]), time: performance.now(), x: t.e, y: t.f, a: t.a, d: t.d });
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.clock.install({ time: new Date('2026-11-22T09:00:00Z') });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-22T10:00:00Z'));
  await page.locator('#training-mode').check(); await page.locator('#start').click(); await page.clock.runFor(1800);
  const arena = page.locator('#arena'); await arena.focus(); await page.keyboard.press('j');
  for (const [phase, duration] of [['startup', 50], ['extension', 80], ['hold', 40], ['recoil', 50], ['return', 80], ['idle', 150]] as const) {
    await page.clock.runFor(duration);
    if (info.project.name === 'desktop') await page.locator('.arena-shell').screenshot({ path: info.outputPath(`jab-${phase}.png`) });
  }
  const frames = await page.evaluate(() => (window as Window & { jabFrames?: { frame: number; time: number; x: number; y: number; a: number; d: number }[] }).jabFrames!);
  expect([...new Set(frames.map(f => f.frame))].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  const contact = frames.filter(f => f.frame === 3);
  expect(contact.at(-1)!.time - contact[0].time).toBeGreaterThanOrEqual(64);
  expect(contact.at(-1)!.time - contact[0].time).toBeLessThanOrEqual(100);
  for (const frame of frames) { expect(frame.x).toBe(430); expect(frame.y).toBe(820); expect(frame.a).toBeCloseTo(.5265107913669065, 6); expect(frame.d).toBeCloseTo(.5265107913669065, 6); }
  await expect(arena).toHaveAttribute('data-player-action', ''); await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
  const alpha = await page.evaluate(async () => {
    const root = new URL('./art/fight/jab/', location.href);
    const manifest = await fetch(new URL('../manifest.json', root)).then(r => r.json());
    return Promise.all(Array.from({ length: 8 }, async (_, i) => {
      const image = new Image(); image.src = new URL(`jab-${i}.webp`, root).href; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const c = canvas.getContext('2d')!; c.drawImage(image, 0, 0); const pixels = c.getImageData(0, 0, image.width, image.height).data;
      let clear = 0, opaque = 0;
      for (let p = 3; p < pixels.length; p += 4) { if (pixels[p] === 0) clear++; if (pixels[p] >= 250) opaque++; }
      const feet = [[0, Math.floor(image.width * .32)], [Math.floor(image.width * .32), Math.floor(image.width * .7)]].map(([left, right], side) => {
        let x = side ? -Infinity : Infinity, y = 0;
        for (let py = Math.floor(image.height * .85); py < image.height; py++) for (let px = left; px < right; px++) {
          if (pixels[(py * image.width + px) * 4 + 3] < 128) continue;
          x = side ? Math.max(x, px) : Math.min(x, px); y = Math.max(y, py);
        }
        const f = manifest.jab[i]; return [(x - f.anchorX) * f.scale, (y - f.anchorY) * f.scale];
      });
      return { clear, opaque, corner: pixels[3], feet };
    }));
  });
  for (const frame of alpha) {
    expect(frame.corner).toBe(0); expect(frame.clear).toBeGreaterThan(100_000); expect(frame.opaque).toBeGreaterThan(20_000);
    for (const [i, expected] of [[-195.16, -3.57], [136.85, -13.09]].entries()) {
      expect(Math.abs(frame.feet[i][0] - expected[0])).toBeLessThan(1);
      expect(Math.abs(frame.feet[i][1] - expected[1])).toBeLessThan(1);
    }
  }
});

test('missing jab artwork blocks start with a readable error and retry recovers', async ({ page }) => {
  await page.route('**/art/fight/jab/jab-3.webp', route => route.abort());
  await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toHaveText('Не загрузился рисунок: jab-3.webp');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'menu');
  await page.unroute('**/art/fight/jab/jab-3.webp'); await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});

test('incomplete jab manifests fail before starting a fight', async ({ page }) => {
  await page.route('**/art/fight/manifest.json', async route => {
    const response = await route.fetch(), manifest = await response.json();
    manifest.jab.pop(); await route.fulfill({ response, json: manifest });
  });
  await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toHaveText('Повреждён список поз бойцов.');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'menu');
});
