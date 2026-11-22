import { expect, test } from '@playwright/test';

test('hybrid jab draws four approved poses, holds original contact and returns to idle after 20 ms', async ({ page }, info) => {
  await page.addInitScript(() => {
    const frames: { frame: number; actor: string; actionTime: number; time: number; x: number; y: number; a: number; d: number }[] = [];
    (window as Window & { jabFrames?: typeof frames }).jabFrames = frames;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const image = args[0];
        if (image instanceof HTMLImageElement && /(?:boxer-|jab-hybrid\/jab-)\d+\.webp$/.test(image.src) && document.querySelector<HTMLCanvasElement>('#arena')?.dataset.playerAction === 'jab') {
          const t = context.getTransform();
          frames.push({ frame: Number(image.src.match(/(?:boxer-|jab-)(\d+)/)![1]), actor: image.src.includes('/jab-hybrid/') ? 'hybrid' : 'boxer', actionTime: Number(document.querySelector<HTMLCanvasElement>('#arena')!.dataset.playerActionTime), time: performance.now(), x: t.e, y: t.f, a: t.a, d: t.d });
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
  const frames = await page.evaluate(() => (window as Window & { jabFrames?: { frame: number; actor: string; actionTime: number; time: number; x: number; y: number; a: number; d: number }[] }).jabFrames!);
  const sequence = frames.map(f => `${f.actor}-${f.frame}`).filter((name, i, all) => i === 0 || name !== all[i - 1]);
  expect(sequence).toEqual(['boxer-0', 'hybrid-0', 'boxer-2', 'hybrid-1', 'boxer-0']);
  const contact = frames.filter(f => f.actor === 'boxer' && f.frame === 2);
  const recoil = frames.filter(f => f.actor === 'hybrid' && f.frame === 1);
  expect(recoil.length).toBeGreaterThan(0); expect(recoil.length).toBeLessThanOrEqual(2);
  for (const f of recoil) { expect(f.actionTime).toBeGreaterThanOrEqual(.16); expect(f.actionTime).toBeLessThan(.18); }
  const idle = frames.find(f => f.actor === 'boxer' && f.frame === 0 && f.actionTime >= .18)!;
  expect(idle.actionTime).toBeLessThan(.2);
  expect(contact.at(-1)!.time - contact[0].time).toBeGreaterThanOrEqual(64);
  expect(contact.at(-1)!.time - contact[0].time).toBeLessThanOrEqual(100);
  for (const frame of frames) { expect(frame.x).toBe(430); expect(frame.y).toBe(820); expect(frame.a).toBeCloseTo(1.19, 6); expect(frame.d).toBeCloseTo(1.19, 6); }
  await expect(arena).toHaveAttribute('data-player-action', ''); await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
  const alpha = await page.evaluate(async () => {
    const root = new URL('./art/fight/jab-hybrid/', location.href);
    const manifest = await fetch(new URL('../manifest.json', root)).then(r => r.json());
    const original = new Image(); original.src = new URL('../boxer-0.webp', root).href; await original.decode();
    const reference = document.createElement('canvas'); reference.width = 500; reference.height = 530;
    const ref = reference.getContext('2d')!; ref.drawImage(original, 0, 0);
    const source = ref.getImageData(0, 0, 500, 530).data;
    return Promise.all(Array.from({ length: 2 }, async (_, i) => {
      const image = new Image(); image.src = new URL(`jab-${i}.webp`, root).href; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const c = canvas.getContext('2d')!; c.drawImage(image, 0, 0); const pixels = c.getImageData(0, 0, image.width, image.height).data;
      let clear = 0, opaque = 0, stablePixels = 0, changedPixels = 0;
      for (let p = 3; p < pixels.length; p += 4) { if (pixels[p] === 0) clear++; if (pixels[p] >= 250) opaque++; }
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (!((y >= 220) || (x >= 126 && x < 220 && y < 92))) continue;
        const at = (y * image.width + x) * 4;
        if (source[at + 3] < 250) continue;
        stablePixels++;
        if (pixels.slice(at, at + 4).some((v, j) => Math.abs(v - source[at + j]) > (source[at + 3] === 255 ? 0 : 1))) changedPixels++;
      }
      const feet = [[0, Math.floor(image.width * .32)], [Math.floor(image.width * .32), Math.floor(image.width * .7)]].map(([left, right], side) => {
        let x = side ? -Infinity : Infinity, y = 0;
        for (let py = Math.floor(image.height * .85); py < image.height; py++) for (let px = left; px < right; px++) {
          if (pixels[(py * image.width + px) * 4 + 3] < 128) continue;
          x = side ? Math.max(x, px) : Math.min(x, px); y = Math.max(y, py);
        }
        const f = manifest.jab[i]; return [(x - f.anchorX) * f.scale, (y - f.anchorY) * f.scale];
      });
      return { clear, opaque, stablePixels, changedPixels, corner: pixels[3], feet };
    }));
  });
  for (const frame of alpha) {
    expect(frame.stablePixels).toBeGreaterThan(30_000); expect(frame.changedPixels).toBe(0);
    expect(frame.corner).toBe(0); expect(frame.clear).toBeGreaterThan(100_000); expect(frame.opaque).toBeGreaterThan(20_000);
    for (const [i, expected] of [[-195.16, -3.57], [136.85, -13.09]].entries()) {
      expect(Math.abs(frame.feet[i][0] - expected[0])).toBeLessThan(1);
      expect(Math.abs(frame.feet[i][1] - expected[1])).toBeLessThan(1);
    }
  }
});

test('missing jab artwork blocks start with a readable error and retry recovers', async ({ page }) => {
  await page.route('**/art/fight/jab-hybrid/jab-1.webp', route => route.abort());
  await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toHaveText('Не загрузился рисунок: jab-1.webp');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'menu');
  await page.unroute('**/art/fight/jab-hybrid/jab-1.webp'); await page.locator('#start').click();
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

test('loading revalidates an old cached eighteen-frame manifest', async ({page}) => {
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const cache = init?.cache ?? (input instanceof Request ? input.cache : 'default');
      if (url.pathname.endsWith('/art/fight/manifest.json') && cache !== 'no-cache') {
        const frame = {width: 500, height: 530, anchorX: 164, anchorY: 495, scale: 1.19};
        return Promise.resolve(new Response(JSON.stringify({boxer: Array(12).fill(frame), worker: Array(12).fill(frame), jab: Array(18).fill(frame)})));
      }
      return fetch(input, init);
    };
  });
  await page.goto('./fight.html');
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});
