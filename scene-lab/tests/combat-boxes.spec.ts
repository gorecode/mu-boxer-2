import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const audit = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/jab-redraw/contact-audit.json', import.meta.url), 'utf8')) as { contacts: { kind: string; actor: string; pose: number; asset: string; minHeight: number }[] };

test('all hero attack boxes lead the actual textured fist and every fighter key pose has a runtime overlay', async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.clock.install({ time: new Date('2026-11-22T09:00:00Z') });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-22T10:00:00Z'));
  await page.locator('#training-mode').check(); await page.locator('#start').click(); await page.clock.runFor(1800);
  for (const entry of audit.contacts) {
    await page.locator('#edit-attack').selectOption(entry.kind); await page.locator('#edit-phase').selectOption('1');
    const right = Number(await page.locator('#edit-right').inputValue());
    const bottom = Number(await page.locator('#edit-bottom').inputValue()), top = Number(await page.locator('#edit-top').inputValue());
    const measured = await page.evaluate(async c => {
      const root = new URL('./art/fight/', location.href), manifest = await fetch(new URL('manifest.json', root)).then(r => r.json());
      const f = manifest[c.actor][c.pose];
      const image = new Image(); image.src = new URL(c.asset, root).href; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      let tip = -Infinity;
      for (let y = 0; y < image.height; y++) {
        if ((f.anchorY - y) * f.scale < c.minHeight) continue;
        for (let x = 0; x < image.width; x++) if (pixels[(y * image.width + x) * 4 + 3] >= 128) {
          tip = Math.max(tip, (c.actor === 'worker' ? f.anchorX - x : x - f.anchorX) * f.scale);
        }
      }
      return tip;
    }, entry);
    if (entry.actor !== 'worker') {
      expect(right - measured, entry.kind).toBeGreaterThanOrEqual(12); expect(right - measured, entry.kind).toBeLessThanOrEqual(24);
    } else {
      expect(right - measured, entry.kind).toBeLessThan(4); expect(right - measured, entry.kind).toBeGreaterThan(-45);
    }
    expect(bottom).toBeLessThan(top);
    await expect(page.locator('#hitboxes')).toBeChecked();
    await expect(page.locator('#arena')).toHaveAttribute(`data-${entry.actor === 'worker' ? 'worker' : 'player'}-cel`, 'active');
    if (info.project.name === 'desktop') await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${entry.kind}-boxes.png`) });
  }
});
