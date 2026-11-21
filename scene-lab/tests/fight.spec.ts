import { expect, test, type Page } from '@playwright/test';

async function load(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-20T09:00:00Z') });
  await page.goto('./fight.html');
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-20T10:00:00Z'));
}
async function begin(page: Page): Promise<void> {
  await page.locator('#start').click(); await page.clock.runFor(1800);
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'fighting');
}
async function number(page: Page, key: string): Promise<number> { return Number(await page.locator('#arena').getAttribute(`data-${key}`)); }

test('standalone fight loads real art and supports keyboard, jump, crouch, pause and clean restart', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await load(page);
  const arenaBox = (await page.locator('.arena-shell').boundingBox())!, introBox = (await page.locator('#intro-card').boundingBox())!;
  expect(introBox.y).toBeGreaterThanOrEqual(arenaBox.y);
  expect(introBox.y + introBox.height).toBeLessThanOrEqual(arenaBox.y + arenaBox.height);
  await expect(page.locator('#player-health')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('#worker-health')).toHaveAttribute('aria-valuenow', '120');
  await begin(page);
  await page.keyboard.down('d'); await page.clock.runFor(500); await page.keyboard.up('d');
  expect(await number(page, 'player-x')).toBeGreaterThan(570);
  await page.keyboard.press('w'); await page.clock.runFor(200); expect(await number(page, 'player-y')).toBeGreaterThan(70);
  await page.clock.runFor(900); expect(await number(page, 'player-y')).toBe(0);
  await page.keyboard.down('s'); await page.keyboard.down('j'); await page.clock.runFor(30);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'low');
  await page.keyboard.up('s'); await page.keyboard.up('j');
  await page.keyboard.press('Escape');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'paused');
  const position = await number(page, 'player-x'), timer = await page.locator('#timer').textContent();
  await page.clock.runFor(2000); expect(await number(page, 'player-x')).toBe(position); await expect(page.locator('#timer')).toHaveText(timer!);
  await page.locator('#resume').click(); await page.clock.runFor(100);
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'fighting');
  await page.keyboard.press('r'); await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'countdown');
  await expect(page.locator('#player-health')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('#worker-health')).toHaveAttribute('aria-valuenow', '120');
  await page.clock.runFor(1750);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('fight-ready.png') });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('AI can finish the match, result is stable and restart restores health', async ({ page }) => {
  test.setTimeout(60_000);
  await load(page); await begin(page);
  for (let i = 0; i < 12 && await page.locator('#arena').getAttribute('data-phase') === 'fighting'; i++) await page.clock.runFor(2000);
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'ending');
  await expect(page.locator('#result-card')).toBeHidden(); await page.clock.runFor(3000);
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'loss');
  await expect(page.locator('#result-title')).toHaveText('НЕ ТОТ АРГУМЕНТ.');
  const hp = await page.locator('#player-hp').textContent(); await page.clock.runFor(3000);
  await expect(page.locator('#player-hp')).toHaveText(hp!);
  await page.locator('#restart').click();
  await expect(page.locator('#player-health')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('#worker-health')).toHaveAttribute('aria-valuenow', '120');
});

test('a player sees the fall, animated KO and fade before victory, then continues to the next story scene', async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const seen: string[] = []; (window as Window & { endingImages?: string[] }).endingImages = seen;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context, args) {
        const image = args[0], stage = document.querySelector<HTMLCanvasElement>('#arena')?.dataset.ending;
        if (image instanceof HTMLImageElement && stage) {
          const entry = `${stage}:${image.src.split('/').pop()}`;
          if (!seen.includes(entry)) seen.push(entry);
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await load(page); await page.locator('#difficulty').selectOption('warmup'); await begin(page);
  for (let i = 0; i < 260; i++) {
    if (await page.locator('#arena').getAttribute('data-phase') !== 'fighting') break;
    const px = await number(page, 'player-x'), wx = await number(page, 'worker-x');
    await page.keyboard.up('a'); await page.keyboard.up('d'); await page.keyboard.up('k');
    if (Math.abs(px - wx) > 215) await page.keyboard.down(wx > px ? 'd' : 'a');
    else await page.keyboard.down('k');
    await page.clock.runFor(180);
  }
  await page.keyboard.up('a'); await page.keyboard.up('d'); await page.keyboard.up('k');
  const arena = page.locator('#arena'), title = page.locator('#ko-callout'), fade = page.locator('#finish-fade');
  await expect(arena).toHaveAttribute('data-phase', 'ending'); await expect(arena).toHaveAttribute('data-ending', 'fall');
  await expect(page.locator('#worker-hp')).toHaveText('0 / 120'); await expect(page.locator('#result-card')).toBeHidden();
  await expect(title).toBeHidden(); await expect(fade).toHaveCSS('opacity', '0');
  expect(await page.evaluate(() => (window as Window & { endingImages?: string[] }).endingImages)).toContain('fall:worker-6.webp');
  const firstImage = await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.clock.runFor(100); expect(await arena.evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(firstImage);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('ending-fall.png') });
  await page.keyboard.press('Escape'); await expect(arena).toHaveAttribute('data-phase', 'paused');
  const fallTime = await arena.getAttribute('data-ending-time'), height = await arena.getAttribute('data-worker-y');
  await page.clock.runFor(1000); await expect(arena).toHaveAttribute('data-ending-time', fallTime!); await expect(arena).toHaveAttribute('data-worker-y', height!);
  await page.locator('#resume').click();
  for (let i = 0; i < 40 && await arena.getAttribute('data-ending') === 'fall'; i++) await page.clock.runFor(50);
  await expect(arena).toHaveAttribute('data-ending', 'ko'); await expect(title).toBeVisible(); await expect(title).toHaveText('K.O.');
  expect(await page.evaluate(() => (window as Window & { endingImages?: string[] }).endingImages)).toContain('ko:worker-11.webp');
  expect(await number(page, 'worker-y')).toBe(0); await expect(fade).toHaveCSS('opacity', '0'); await expect(page.locator('#result-card')).toBeHidden();
  const large = await title.evaluate(el => getComputedStyle(el).transform);
  await page.clock.runFor(160); expect(await title.evaluate(el => getComputedStyle(el).transform)).not.toBe(large);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('ending-ko.png') });
  for (let i = 0; i < 60 && await arena.getAttribute('data-ending') === 'ko'; i++) await page.clock.runFor(20);
  await expect(arena).toHaveAttribute('data-ending', 'fade'); await page.clock.runFor(220);
  const opacity = Number(await fade.evaluate(el => getComputedStyle(el).opacity)); expect(opacity).toBeGreaterThan(.2); expect(opacity).toBeLessThan(.8);
  await expect(page.locator('#result-card')).toBeHidden(); await page.locator('.arena-shell').screenshot({ path: info.outputPath('ending-fade.png') });
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await expect(arena).toHaveAttribute('data-phase', 'paused');
  const fadeTime = await arena.getAttribute('data-ending-time'); await page.clock.runFor(1000);
  await expect(arena).toHaveAttribute('data-ending-time', fadeTime!); expect(Number(await fade.evaluate(el => getComputedStyle(el).opacity))).toBe(opacity);
  await page.locator('#resume').click(); await page.clock.runFor(700);
  await expect(arena).toHaveAttribute('data-phase', 'win'); await expect(page.locator('#restart')).toBeFocused();
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('ending-result.png') });
  await expect(page.locator('#result-title')).toHaveText('ВОПРОС РЕШЁН.');
  await expect(page.locator('#next-scene')).toHaveAttribute('href', './index.html#scene=precinct&t=0');
});

test('pointer controls release on cancellation and tab loss pauses without stuck movement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page); await begin(page);
  await expect(page.locator('.touch-controls')).toBeVisible();
  const right = page.locator('[data-input=right]'), box = (await right.boundingBox())!;
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2); await page.mouse.down();
  await page.clock.runFor(300); expect(await number(page, 'player-x')).toBeGreaterThan(500);
  await right.dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
  const x = await number(page, 'player-x'); await page.clock.runFor(100); expect(await number(page, 'player-x')).toBeCloseTo(x, 0);
  await page.keyboard.down('d'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.up('d'); await page.locator('#resume').click(); await page.clock.runFor(200);
  expect(await number(page, 'player-x')).toBeCloseTo(x, 0);
});

test('failed art blocks the match, retry recovers and reduced motion remains playable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/art/fight/worker-0.webp', route => route.abort());
  await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toContainText('Не загрузился рисунок');
  await expect(page.locator('#start')).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'menu');
  await page.unroute('**/art/fight/worker-0.webp'); await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.locator('#start').click();
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'countdown');
});

test('releasing one movement alias keeps the other held key active', async ({ page }) => {
  await load(page); await begin(page);
  await page.keyboard.down('d'); await page.keyboard.down('ArrowRight'); await page.clock.runFor(150);
  await page.keyboard.up('d'); const before = await number(page, 'player-x');
  await page.clock.runFor(150); expect(await number(page, 'player-x')).toBeGreaterThan(before + 40);
  await page.keyboard.up('ArrowRight'); const stopped = await number(page, 'player-x');
  await page.clock.runFor(150); expect(await number(page, 'player-x')).toBe(stopped);
});

test('invalid pose metadata explains the error and allows a clean retry', async ({ page }) => {
  await page.route('**/art/fight/manifest.json', route => route.fulfill({ json: { boxer: [], worker: [] } }));
  await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toHaveText('Повреждён список поз бойцов.');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'menu');
  await page.unroute('**/art/fight/manifest.json'); await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});

test('visible control buttons work with the keyboard and Space still activates the pause button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page); await begin(page);
  await page.locator('[data-input=left]').focus(); await page.keyboard.down('Space'); await page.clock.runFor(200);
  await page.keyboard.up('Space'); expect(await number(page, 'player-x')).toBeLessThan(380);
  const x = await number(page, 'player-x'); await page.clock.runFor(100); expect(await number(page, 'player-x')).toBe(x);
  await page.locator('#pause').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'paused');
});

test('a held attack does not repeat; quick taps survive between render frames and pause clears pending input', async ({ page }) => {
  await load(page); await begin(page);
  await page.keyboard.down('j'); await page.clock.runFor(700);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
  await page.clock.runFor(400);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
  await page.keyboard.up('j'); await page.clock.runFor(30);
  await page.keyboard.press('k'); await page.clock.runFor(30);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'heavy');
  await page.keyboard.press('j'); await page.clock.runFor(20);
  await expect(page.locator('#arena')).toHaveAttribute('data-buffered', 'jab');
  await page.keyboard.press('Escape'); await page.locator('#resume').click(); await page.clock.runFor(850);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
  await expect(page.locator('#arena')).toHaveAttribute('data-buffered', '');
});

test('real keyboard and touch presses chain confirmed hits into a launching uppercut', async ({ page }, info) => {
  await load(page); await page.locator('#difficulty').selectOption('warmup'); await begin(page);
  await page.keyboard.down('d');
  for (let i = 0; i < 40 && Math.abs(await number(page, 'worker-x') - await number(page, 'player-x')) > 300; i++) await page.clock.runFor(40);
  await page.keyboard.up('d'); await page.keyboard.down('l'); await page.clock.runFor(1100); await page.keyboard.up('l');
  await page.keyboard.down('d');
  for (let i = 0; i < 30 && Math.abs(await number(page, 'worker-x') - await number(page, 'player-x')) > 180; i++) await page.clock.runFor(20);
  await page.keyboard.up('d');
  if (info.project.name === 'mobile') await page.locator('[data-input=light]').tap();
  else await page.keyboard.press('j');
  await page.clock.runFor(130);
  await expect(page.locator('#arena')).toHaveAttribute('data-combo', '1');
  if (info.project.name === 'mobile') await page.locator('[data-input=heavy]').tap();
  else await page.keyboard.press('k');
  await page.clock.runFor(310);
  await expect(page.locator('#arena')).toHaveAttribute('data-combo', '2');
  await page.keyboard.down('s');
  if (info.project.name === 'mobile') await page.locator('[data-input=heavy]').tap();
  else await page.keyboard.press('k');
  await page.clock.runFor(340); await page.keyboard.up('s');
  await expect(page.locator('#arena')).toHaveAttribute('data-combo', '3');
  await expect(page.locator('#arena')).toHaveAttribute('data-worker-reaction', 'launch');
  expect(await number(page, 'worker-y')).toBeGreaterThan(0);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('fight-combo.png') });
});

test('short attack chords preserve the modifier at press time after every key is released', async ({ page }) => {
  await load(page); await begin(page);
  await page.keyboard.down('s'); await page.keyboard.press('k'); await page.keyboard.up('s'); await page.clock.runFor(30);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'upper');
  await page.keyboard.press('r'); await page.clock.runFor(1800);
  await page.keyboard.press('k'); await page.keyboard.down('s'); await page.clock.runFor(30);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'heavy');
  await page.keyboard.up('s');
});

test('autorepeat after pause cannot create an attack until the held key is released and pressed again', async ({ page }) => {
  await load(page); await begin(page);
  await page.keyboard.down('j'); await page.clock.runFor(700);
  await page.keyboard.press('Escape'); await page.locator('#resume').click();
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', repeat: true, bubbles: true })));
  await page.clock.runFor(30);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
  await page.keyboard.up('j'); await page.keyboard.press('j'); await page.clock.runFor(30);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'jab');
});


test('jab connects at visible reach and runtime hitbox checkbox redraws live and paused without changing combat', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  const checkbox = page.getByRole('checkbox', { name: 'ХИТБОКСЫ' });
  const colors = () => page.locator('#arena').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(300, 250, 1100, 580).data;
    let hurt = 0, hit = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 66 && pixels[i + 1] === 232 && pixels[i + 2] === 239) hurt++;
      if (pixels[i] === 255 && pixels[i + 1] === 66 && pixels[i + 2] === 100) hit++;
    }
    return { hurt, hit };
  });
  await expect(checkbox).not.toBeChecked(); expect(await colors()).toEqual({ hurt: 0, hit: 0 });
  await checkbox.check(); expect((await colors()).hurt).toBeGreaterThan(500);
  await checkbox.uncheck(); expect(await colors()).toEqual({ hurt: 0, hit: 0 });
  await page.locator('#difficulty').selectOption('warmup'); await begin(page);
  await page.keyboard.down('d');
  for (let i = 0; i < 60 && await number(page, 'worker-x') - await number(page, 'player-x') > 300; i++) await page.clock.runFor(20);
  await page.keyboard.up('d');
  const distance = await number(page, 'worker-x') - await number(page, 'player-x');
  expect(distance).toBeGreaterThan(280); expect(distance).toBeLessThanOrEqual(300);
  const hp = Number(await page.locator('#worker-health').getAttribute('aria-valuenow'));
  await checkbox.focus(); await page.keyboard.press('Space'); await expect(checkbox).toBeChecked();
  await page.clock.runFor(20); expect(await number(page, 'player-y')).toBe(0);
  await page.keyboard.press('j'); await page.clock.runFor(30);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'jab');
  expect((await colors()).hit).toBe(0);
  await page.clock.runFor(100);
  await expect(page.locator('#worker-health')).toHaveAttribute('aria-valuenow', String(hp - 8));
  expect((await colors()).hit).toBeGreaterThan(200);
  await page.keyboard.press('Escape');
  const x = await number(page, 'player-x'), timer = await page.locator('#timer').textContent();
  await checkbox.uncheck(); expect(await colors()).toEqual({ hurt: 0, hit: 0 });
  await checkbox.check(); expect((await colors()).hit).toBeGreaterThan(200);
  await page.clock.runFor(500);
  expect(await number(page, 'player-x')).toBe(x); await expect(page.locator('#timer')).toHaveText(timer!);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('fight-hitboxes.png') });
  await page.locator('#pause-restart').click(); await expect(checkbox).toBeChecked();
  await page.clock.runFor(30); expect((await colors()).hit).toBe(0); expect((await colors()).hurt).toBeGreaterThan(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
