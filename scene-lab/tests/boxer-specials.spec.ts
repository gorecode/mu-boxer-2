import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60_000);
type Draw = { kind: string; file: string; hp: string; reaction: string; time: number; x: number; y: number };
type Recorded = Window & { specialDraws?: Draw[]; fallenDraws?: { left: number; right: number }[] };
async function begin(page: Page, training = true) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-25T09:00:00Z') });
  await page.addInitScript(() => {
    (window as Recorded).specialDraws = [];
    (window as Recorded).fallenDraws = [];
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const arena = document.querySelector<HTMLCanvasElement>('#arena'), image = args[0];
        if (context.canvas === arena && image instanceof HTMLImageElement && image.src.endsWith('/worker-11.webp') && arena.dataset.workerReaction === 'down' && Number(arena.dataset.workerY) === 0) {
          const m = context.getTransform(), a = m.e + args[1] * m.a, b = m.e + (args[1] + image.width) * m.a;
          (window as Recorded).fallenDraws!.push({ left: Math.min(a,b), right: Math.max(a,b) });
        }
        if (context.canvas === arena && image instanceof HTMLImageElement && ['ram', 'counter'].includes(arena.dataset.playerAction ?? '')) {
          const file = image.src.split('/art/fight/')[1];
          if (file && /^(boxer-|walk\/|jab-hybrid\/|cross-hybrid\/)/.test(file)) {
            const m = context.getTransform();
            (window as Recorded).specialDraws!.push({ kind: arena.dataset.playerAction!, file, hp: document.querySelector('#worker-hp')!.textContent!,
              reaction: arena.dataset.workerReaction ?? '', time: Number(arena.dataset.playerActionTime), x: m.e, y: m.f });
          }
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-25T10:00:00Z'));
  if (training) await page.locator('#training-mode').check();
  await page.locator('#start').click(); await page.clock.runFor(1800); await page.locator('#arena').focus();
}
async function reset(page: Page, walk = 0, mirror = false) {
  await page.locator('#arena').focus(); await page.keyboard.press('r'); await page.clock.runFor(1800);
  if (walk) { await page.keyboard.down('d'); await page.clock.runFor(walk); await page.keyboard.up('d'); }
  if (mirror) {
    await page.keyboard.down('d'); await page.keyboard.press('Space'); await page.clock.runFor(1100); await page.keyboard.up('d');
    await expect(page.locator('#arena')).toHaveAttribute('data-player-facing', '-1');
  }
  await page.clock.runFor(350);
  await page.evaluate(() => { (window as Recorded).specialDraws!.length = 0; (window as Recorded).fallenDraws!.length = 0; });
}
async function perform(page: Page, kind: 'ram' | 'counter', touch = false, mirror = false) {
  const forward = mirror ? 'left' : 'right', back = mirror ? 'right' : 'left';
  for (const dir of kind === 'ram' ? [forward, forward] : [back, forward]) {
    if (touch) await page.locator(`[data-input=${dir}]`).tap();
    else await page.keyboard.press(dir === 'right' ? 'd' : 'a');
    await page.clock.runFor(45);
  }
  if (touch) await page.locator('[data-input=light]').tap(); else await page.keyboard.press('j');
  await page.clock.runFor(20);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', kind);
}

test('real MK direction sequences hit twice with the approved drawings, on keyboard and touch', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await begin(page);
  for (const kind of ['ram', 'counter'] as const) {
    await reset(page, kind === 'ram' ? 850 : 1200);
    await perform(page, kind, info.project.name === 'mobile');
    await expect(page.locator('#player-technique')).toContainText(kind === 'ram' ? 'ТАРАННЫЙ' : 'ПОДШАГ');
    await page.clock.runFor(kind === 'ram' ? 350 : 520);
    await page.locator('#hitboxes').check(); await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-gameplay.png`) });
    await page.clock.runFor(1400);
    await expect(page.locator('#worker-hp')).toHaveText(kind === 'ram' ? '92 / 120' : '95 / 120');
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
    const frames = await page.evaluate(() => (window as Recorded).specialDraws!);
    const files = new Set(frames.map(f => f.file));
    for (const file of kind === 'ram' ? ['jab-hybrid/jab-0.webp', 'boxer-2.webp', 'cross-hybrid/cross-0.webp', 'boxer-3.webp'] : ['walk/walk-3.webp', 'boxer-3.webp', 'cross-hybrid/cross-0.webp', 'boxer-12.webp']) expect(files.has(file), file).toBe(true);
    expect(frames.some(f => f.hp === (kind === 'ram' ? '110 / 120' : '111 / 120'))).toBe(true);
    expect(frames.some(f => f.reaction === 'down')).toBe(kind === 'ram');
    if (kind === 'ram') {
      const fallen = await page.evaluate(() => (window as Recorded).fallenDraws!);
      expect(fallen.length).toBeGreaterThan(0); expect(fallen.every(f => f.left >= 0 && f.right <= 1600)).toBe(true);
    }
    for (const f of frames) expect(f.y).toBe(820);
    await page.clock.runFor(600); await expect(page.locator('#worker-hp')).toHaveText(kind === 'ram' ? '92 / 120' : '95 / 120');
  }
  expect(errors).toEqual([]);
});

test('facing-left commands are mirrored through real movement and jumping past the opponent', async ({ page }) => {
  await begin(page);
  for (const kind of ['ram', 'counter'] as const) {
    await reset(page, 1700, true); await perform(page, kind, false, true); await page.clock.runFor(1500);
    await expect(page.locator('#worker-hp')).toHaveText(kind === 'ram' ? '92 / 120' : '95 / 120');
    const frames = await page.evaluate(() => (window as Recorded).specialDraws!);
    expect(frames.length).toBeGreaterThan(10); expect(frames.every(f => f.y === 820)).toBe(true);
    if (kind === 'ram') {
      const fallen = await page.evaluate(() => (window as Recorded).fallenDraws!);
      expect(fallen.length).toBeGreaterThan(0); expect(fallen.every(f => f.left >= 0 && f.right <= 1600)).toBe(true);
    }
  }
});

test('both commands start in an actual fight and their touch shortcut buttons start the same moves', async ({ page }, info) => {
  await begin(page, false);
  for (const kind of ['ram', 'counter'] as const) {
    await reset(page); await perform(page, kind, info.project.name === 'mobile');
    await expect(page.locator('#arena')).toHaveAttribute('data-training', 'false');
    await reset(page);
    if (info.project.name === 'desktop') await page.setViewportSize({ width: 640, height: 900 });
    const button = page.locator(`[data-input=${kind}]`);
    await expect(button).toBeVisible();
    if (info.project.name === 'mobile') await button.tap(); else await button.click();
    await page.clock.runFor(20); await expect(page.locator('#arena')).toHaveAttribute('data-player-action', kind);
  }
});

test('holding, expired taps, pause and FF+K do not accidentally fire the new light specials', async ({ page }) => {
  await begin(page); const arena = page.locator('#arena');
  await page.keyboard.down('d'); await page.clock.runFor(150); await page.keyboard.press('j'); await page.keyboard.up('d');
  await page.clock.runFor(20); await expect(arena).toHaveAttribute('data-player-action', 'jab');
  await reset(page); await page.keyboard.press('d'); await page.clock.runFor(40); await page.keyboard.press('d'); await page.clock.runFor(300);
  await page.keyboard.press('j'); await page.clock.runFor(20); await expect(arena).toHaveAttribute('data-player-action', 'jab');
  await reset(page); await page.keyboard.press('a'); await page.clock.runFor(40); await page.keyboard.press('a');
  await page.keyboard.press('j'); await page.clock.runFor(20); await expect(arena).toHaveAttribute('data-player-action', 'jab');
  await reset(page); await page.keyboard.press('a'); await page.clock.runFor(300); await page.keyboard.press('d');
  await page.keyboard.press('j'); await page.clock.runFor(20); await expect(arena).toHaveAttribute('data-player-action', 'jab');
  await reset(page); await page.keyboard.press('a'); await page.keyboard.press('Escape'); await page.locator('#resume').click();
  await page.keyboard.press('d'); await page.keyboard.press('j'); await page.clock.runFor(20); await expect(arena).toHaveAttribute('data-player-action', 'jab');
  await reset(page); await page.keyboard.press('d'); await page.keyboard.press('d'); await page.keyboard.press('k');
  await page.clock.runFor(20); await expect(arena).toHaveAttribute('data-player-action', 'long');
  await reset(page, 850); await page.keyboard.press('d'); await page.keyboard.press('d'); await page.keyboard.down('j');
  await page.clock.runFor(1600); await expect(arena).toHaveAttribute('data-player-action', '');
  await expect(page.locator('#worker-hp')).toHaveText('92 / 120'); await page.keyboard.up('j');
  await reset(page); await page.keyboard.press('a'); await page.clock.runFor(45); await page.keyboard.down('d');
  await page.keyboard.press('j'); await page.keyboard.up('d'); await page.clock.runFor(20);
  await expect(arena).toHaveAttribute('data-player-action', 'counter');
});

test('guard holds both contacts; editor exposes both hitboxes, validates, resets and returns to a four-stage move', async ({ page }, info) => {
  await begin(page); const arena = page.locator('#arena');
  for (const kind of ['ram', 'counter'] as const) {
    await reset(page, 1200); await page.locator('#training-dummy').selectOption('guard'); await arena.focus();
    await perform(page, kind); await page.clock.runFor(1400);
    await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
    expect(Number(await arena.getAttribute('data-worker-guard'))).toBeLessThan(60);
  }
  await page.locator('#edit-attack').selectOption('counter');
  await expect(page.locator('#edit-phase option')).toHaveCount(10);
  await page.locator('#edit-phase').selectOption('7'); await expect(arena).toHaveAttribute('data-player-cel', 'active');
  await expect(page.locator('#edit-pose')).toHaveValue('12'); await expect(page.locator('#edit-right')).toHaveValue('178');
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('counter-second-hitbox.png') });
  await page.locator('#edit-duration').fill('200'); await page.locator('#edit-duration').press('Tab');
  await page.locator('#edit-pose').fill('27'); await page.locator('#edit-pose').press('Tab');
  await expect(page.locator('#training-status')).toContainText('Недопустимые'); await expect(page.locator('#edit-pose')).toHaveValue('12');
  await page.locator('#edit-defaults').click(); await expect(page.locator('#edit-duration')).toHaveValue('120');
  await page.locator('#edit-attack').selectOption('ram'); await expect(page.locator('#edit-phase option')).toHaveCount(7);
  await page.locator('#edit-phase').selectOption('4'); await expect(page.locator('#edit-pose')).toHaveValue('3');
  await expect(page.locator('#edit-right')).toHaveValue('251');
  await page.locator('#training-step').click(); await expect(page.locator('#worker-hp')).toHaveText('102 / 120');
  await expect(arena).toHaveAttribute('data-player-contacts', '0,1');
  await page.locator('#edit-attack').selectOption('jab'); await expect(page.locator('#edit-phase option')).toHaveCount(4);
  await expect(page.locator('#edit-phase')).toHaveValue('3');
});
