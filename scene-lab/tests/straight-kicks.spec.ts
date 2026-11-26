import { expect, test, type Page } from '@playwright/test';

type Draw = { pose: number; action: string; time: number; x: number; y: number; scale: number; dx: number; dy: number };
type Recorded = Window & { kickDraws?: Draw[] };
async function begin(page: Page, training = true) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-26T09:00:00Z') });
  await page.addInitScript(() => {
    (window as Recorded).kickDraws = [];
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const arena = document.querySelector<HTMLCanvasElement>('#arena'), image = args[0];
        const match = image instanceof HTMLImageElement ? image.src.match(/boxer-(\d+)\.webp$/) : null;
        if (context.canvas === arena && match && ['leadKick','rearKick'].includes(arena?.dataset.playerAction ?? '')) {
          const m = context.getTransform();
          (window as Recorded).kickDraws!.push({ pose: Number(match[1]), action: arena!.dataset.playerAction!, time: Number(arena!.dataset.playerActionTime), x: m.e, y: m.f, scale: m.a, dx: args[1], dy: args[2] });
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

test('N/M play the exact chosen keys with planted support, quick return and no repeats on hold', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await begin(page);
  for (const [key, kind, first, name] of [['n','leadKick',16,'ПЕРЕДНЕЙ'],['m','rearKick',18,'ЗАДНЕЙ']] as const) {
    await page.evaluate(() => { (window as Recorded).kickDraws!.length = 0; });
    await page.keyboard.down(key); await page.clock.runFor(110);
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', kind);
    await expect(page.locator('#player-technique')).toContainText(name);
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-in-game.png`) });
    await page.clock.runFor(800);
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
    await page.keyboard.up(key); await page.clock.runFor(150);
    const draws = await page.evaluate(() => (window as Recorded).kickDraws!);
    expect(draws.map(d => d.pose).filter((p, i, list) => i === 0 || p !== list[i-1])).toEqual([first,first+1,first,0]);
    for (const f of draws) {
      expect(f.x).toBe(430); expect(f.y).toBe(820); expect(f.scale).toBeCloseTo(1.19, 6);
      if (f.pose >= 16) { expect(f.dx).toBe(-268); expect(f.dy).toBe(-562); }
      if (f.pose === first+1) { expect(f.time).toBeGreaterThanOrEqual(.08-1e-8); expect(f.time).toBeLessThan(.2); }
    }
  }
  await page.keyboard.press('j'); await page.clock.runFor(30);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'jab');
  expect(errors).toEqual([]);
});

test('real kicks damage once, freeze at contact and restore from training save; guard absorbs them', async ({ page }, info) => {
  await begin(page); const arena = page.locator('#arena');
  for (const [key, kind, hp] of [['n','leadKick',106],['m','rearKick',100]] as const) {
    await page.keyboard.down('d'); await page.clock.runFor(1550); await page.keyboard.up('d');
    await page.locator('#hitboxes').check(); await arena.focus();
    const x = await arena.getAttribute('data-player-x');
    await page.keyboard.press(key); await page.clock.runFor(100);
    await expect(page.locator('#worker-hp')).toHaveText(`${hp} / 120`);
    await expect(arena).toHaveAttribute('data-player-action', kind);
    expect(await arena.getAttribute('data-player-x')).toBe(x);
    expect(Number(await arena.getAttribute('data-player-stop'))).toBeGreaterThan(0);
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-hitboxes.png`) });
    await page.locator('#training-freeze').click(); await page.locator('#training-save').click();
    const time = await arena.getAttribute('data-player-action-time');
    const pixels = await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await page.clock.runFor(200); expect(await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(pixels);
    await page.locator('#training-freeze').click(); await page.clock.runFor(800);
    await expect(page.locator('#worker-hp')).toHaveText(`${hp} / 120`);
    await page.locator('#training-load').click(); await expect(arena).toHaveAttribute('data-player-action', kind);
    expect(await arena.getAttribute('data-player-action-time')).toBe(time);
    await page.locator('#training-freeze').click(); await page.clock.runFor(800);
    await arena.focus(); await page.keyboard.press('r'); await page.clock.runFor(1800);
    await page.locator('#training-dummy').selectOption('guard'); await arena.focus();
    await page.keyboard.down('d'); await page.clock.runFor(1550); await page.keyboard.up('d');
    await page.keyboard.press(key); await page.clock.runFor(110);
    await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
    await expect(arena).toHaveAttribute('data-worker-reaction', 'guard');
    expect(Number(await arena.getAttribute('data-worker-guard'))).toBeLessThan(100);
    await page.locator('#training-dummy').selectOption('idle'); await arena.focus();
    await page.keyboard.press('r'); await page.clock.runFor(1800);
  }
});

test('touch kicks and editor keys work in training; both keyboard keys work in a regular fight', async ({ page }, info) => {
  await begin(page);
  for (const [key, kind] of [['n','leadKick'],['m','rearKick']] as const) {
    if (info.project.name === 'mobile') await page.locator(`[data-input=${kind}]`).tap(); else await page.keyboard.press(key);
    await page.clock.runFor(100); await expect(page.locator('#arena')).toHaveAttribute('data-player-action', kind);
    await page.clock.runFor(700);
  }
  for (const [kind, contact] of [['leadKick','17'],['rearKick','19']] as const) {
    await page.locator('#edit-attack').selectOption(kind); await page.locator('#edit-phase').selectOption('1');
    await expect(page.locator('#edit-pose')).toHaveValue(contact);
    await expect(page.locator('#edit-pose')).toHaveAttribute('max', '19');
    await expect(page.locator('#hitboxes')).toBeChecked();
    const measured = await page.evaluate(async pose => {
      const root = new URL('./art/fight/', location.href), manifest = await fetch(new URL('manifest.json', root)).then(r => r.json());
      const f = manifest.boxer[pose], image = new Image(); image.src = new URL(`boxer-${pose}.webp`, root).href; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const c = canvas.getContext('2d')!; c.drawImage(image, 0, 0); const data = c.getImageData(0, 0, image.width, image.height).data;
      let tip = -Infinity;
      for (let y = 190; y < 340; y++) for (let x = 380; x < image.width; x++) if (data[(y * image.width + x) * 4 + 3] >= 128) tip = Math.max(tip, (x - f.anchorX) * f.scale);
      return tip;
    }, Number(contact));
    const margin = Number(await page.locator('#edit-right').inputValue()) - measured;
    expect(margin).toBeGreaterThanOrEqual(12); expect(margin).toBeLessThanOrEqual(24);
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-editor.png`) });
  }
  await page.locator('#training-mode').uncheck();
  await page.clock.runFor(1800); await page.locator('#arena').focus();
  for (const [key, kind] of [['n','leadKick'],['m','rearKick']] as const) {
    await page.keyboard.press(key); await page.clock.runFor(100);
    await expect(page.locator('#arena')).toHaveAttribute('data-training', 'false');
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', kind);
    await page.clock.runFor(700);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('missing kick art can be retried and an incomplete pose manifest is rejected', async ({ page }) => {
  let missing = true;
  await page.route('**/art/fight/boxer-19.webp', async route => { if (missing) await route.abort(); else await route.continue(); });
  await page.goto('./fight.html'); await expect(page.locator('#load-status')).toContainText('boxer-19.webp');
  await expect(page.locator('#start')).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ'); missing = false;
  await page.locator('#start').click(); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.route('**/art/fight/manifest.json', async route => {
    const response = await route.fetch(); const manifest = await response.json(); manifest.boxer.pop();
    await route.fulfill({ response, json: manifest });
  });
  await page.reload(); await expect(page.locator('#load-status')).toHaveText('Повреждён список поз бойцов.');
});
