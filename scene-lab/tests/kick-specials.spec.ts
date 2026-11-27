import { expect, test, type Page } from '@playwright/test';

type Draw = { pose: number; action: string; time: number; x: number; y: number; scale: number; dx: number; dy: number; hp: string };
type Recorded = Window & { kickSpecialDraws?: Draw[]; fallenBounds?: { left: number; right: number }[] };
async function begin(page: Page, training = true, reduced = true) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.clock.install({ time: new Date('2026-11-26T11:00:00Z') });
  await page.addInitScript(() => {
    (window as Recorded).kickSpecialDraws = []; (window as Recorded).fallenBounds = [];
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const arena = document.querySelector<HTMLCanvasElement>('#arena'), image = args[0];
        if (context.canvas === arena && image instanceof HTMLImageElement) {
          const match = image.src.match(/boxer-(\d+)\.webp$/), m = context.getTransform();
          if (match && ['doublePiston','heelSlide'].includes(arena?.dataset.playerAction ?? '')) {
            (window as Recorded).kickSpecialDraws!.push({ pose: Number(match[1]), action: arena!.dataset.playerAction!, time: Number(arena!.dataset.playerActionTime),
              x: m.e, y: m.f, scale: m.a, dx: args[1], dy: args[2], hp: document.querySelector('#worker-hp')!.textContent! });
          }
          if (image.src.endsWith('/worker-11.webp') && arena?.dataset.workerReaction === 'down' && Number(arena.dataset.workerY) === 0) {
            const a = m.e + args[1] * m.a, b = m.e + (args[1] + image.width) * m.a;
            (window as Recorded).fallenBounds!.push({ left: Math.min(a,b), right: Math.max(a,b) });
          }
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-26T12:00:00Z'));
  if (training) await page.locator('#training-mode').check();
  await page.locator('#start').click(); await page.clock.runFor(1800); await page.locator('#arena').focus();
}
async function perform(page: Page, kind: 'doublePiston' | 'heelSlide', touch = false, mirror = false) {
  const forward = mirror ? 'left' : 'right', back = mirror ? 'right' : 'left';
  for (const dir of kind === 'doublePiston' ? [forward, forward] : [back, forward]) {
    if (touch) await page.locator(`[data-input=${dir}]`).tap(); else await page.keyboard.press(dir === 'right' ? 'd' : 'a');
    await page.clock.runFor(45);
  }
  if (touch) await page.locator('[data-input=leadKick]').tap(); else await page.keyboard.press('n');
  await page.clock.runFor(20);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', kind);
}

for (const kind of ['doublePiston', 'heelSlide'] as const) for (const mirror of [false, true]) {
  test(`${kind} uses real mirrored MK inputs and selected drawings, keyboard/touch (${mirror ? 'left' : 'right'})`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await begin(page);
    await page.keyboard.down('d'); await page.clock.runFor(mirror ? 1700 : kind === 'doublePiston' ? 1450 : 850); await page.keyboard.up('d');
    if (mirror) {
      await page.keyboard.down('d'); await page.keyboard.press('Space'); await page.clock.runFor(1100); await page.keyboard.up('d');
      await expect(page.locator('#arena')).toHaveAttribute('data-player-facing', '-1');
    }
    await page.clock.runFor(350);
    await perform(page, kind, info.project.name === 'mobile' && !mirror, mirror);
    await expect(page.locator('#player-technique')).toContainText(kind === 'doublePiston' ? 'ДВОЙНОЙ ПОРШЕНЬ' : 'ПОДКАТ ПЯТКОЙ');
    await page.clock.runFor(520); await page.locator('#hitboxes').check();
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-${mirror ? 'left' : 'right'}-gameplay.png`) });
    await page.clock.runFor(1400);
    await expect(page.locator('#worker-hp')).toHaveText(kind === 'doublePiston' ? '92 / 120' : '101 / 120');
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', '');
    const frames = await page.evaluate(() => (window as Recorded).kickSpecialDraws!);
    expect(frames.map(f => f.pose).filter((p,i,list) => i === 0 || p !== list[i-1])).toEqual(kind === 'doublePiston' ? [16,17,16,0,18,19,18,0] : [5,20,5,0]);
    expect(frames.length).toBeGreaterThan(10);
    if (kind === 'doublePiston') expect(frames.some(f => f.hp === '110 / 120')).toBe(true);
    for (const f of frames) {
      expect(f.y).toBe(820); expect(f.scale).toBeCloseTo(mirror ? -1.19 : 1.19, 6);
      if (f.pose === 20) { expect(f.dx).toBe(-268); expect(f.dy).toBe(-556); }
    }
    const fallen = await page.evaluate(() => (window as Recorded).fallenBounds!);
    expect(fallen.length > 0).toBe(kind === 'heelSlide');
    expect(fallen.every(b => b.left >= 0 && b.right <= 1600)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const kind of ['doublePiston', 'heelSlide'] as const) {
  test(`${kind} is absorbed by guard; editor exposes chosen contacts and saved hitstop resumes once`, async ({ page }, info) => {
    await begin(page); const arena = page.locator('#arena');
    await page.keyboard.down('d'); await page.clock.runFor(1450); await page.keyboard.up('d'); await page.clock.runFor(350);
    await page.locator('#training-dummy').selectOption('guard'); await arena.focus();
    await perform(page, kind); await page.clock.runFor(1300);
    await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
    expect(Number(await arena.getAttribute('data-worker-guard'))).toBeLessThan(kind === 'doublePiston' ? 60 : 100);
    await page.locator('#training-dummy').selectOption('idle'); await arena.focus();
    await perform(page, kind); await page.clock.runFor(80);
    await expect(page.locator('#worker-hp')).toHaveText(kind === 'doublePiston' ? '110 / 120' : '101 / 120');
    expect(Number(await arena.getAttribute('data-player-stop'))).toBeGreaterThan(0);
    await page.locator('#training-freeze').click(); await page.locator('#training-save').click();
    const time = await arena.getAttribute('data-player-action-time');
    await page.clock.runFor(200); expect(await arena.getAttribute('data-player-action-time')).toBe(time);
    await page.locator('#training-freeze').click(); await page.clock.runFor(1500);
    await expect(page.locator('#worker-hp')).toHaveText(kind === 'doublePiston' ? '92 / 120' : '101 / 120');
    await page.locator('#training-load').click(); await expect(arena).toHaveAttribute('data-player-action-time', time!);
    await page.locator('#training-freeze').click(); await page.clock.runFor(1500);
    await expect(page.locator('#worker-hp')).toHaveText(kind === 'doublePiston' ? '92 / 120' : '101 / 120');
    await page.locator('#edit-attack').selectOption(kind);
    await expect(page.locator('#edit-phase option')).toHaveCount(kind === 'doublePiston' ? 8 : 4);
    await page.locator('#edit-phase').selectOption('1');
    await expect(page.locator('#edit-pose')).toHaveValue(kind === 'doublePiston' ? '17' : '20');
    await expect(page.locator('#edit-pose')).toHaveAttribute('max', '25');
    await expect(page.locator('#edit-right')).toHaveValue(kind === 'doublePiston' ? '218' : '332');
    if (kind === 'doublePiston') {
      await page.locator('#edit-phase').selectOption('5'); await expect(page.locator('#edit-pose')).toHaveValue('19');
      await expect(page.locator('#edit-right')).toHaveValue('366'); await page.locator('#edit-phase').selectOption('1');
    }
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-editor.png`) });
  });

  test(`${kind} also starts by real input and shortcut button in a regular fight`, async ({ page }, info) => {
    await begin(page, false); await perform(page, kind, info.project.name === 'mobile');
    await expect(page.locator('#arena')).toHaveAttribute('data-training', 'false');
    await page.clock.runFor(1300); await page.keyboard.press('Escape'); await page.locator('#pause-restart').click(); await page.clock.runFor(1800);
    if (info.project.name === 'desktop') await page.setViewportSize({ width: 640, height: 900 });
    const button = page.locator(`[data-input=${kind}]`);
    if (info.project.name === 'mobile') await button.tap(); else await button.click();
    await page.clock.runFor(20); await expect(page.locator('#arena')).toHaveAttribute('data-player-action', kind);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('missing new slide drawing is reported and can be retried', async ({ page }) => {
  let missing = true;
  await page.route('**/art/fight/boxer-20.webp', async route => { if (missing) await route.abort(); else await route.continue(); });
  await page.goto('./fight.html'); await expect(page.locator('#load-status')).toContainText('boxer-20.webp');
  await expect(page.locator('#start')).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ');
  missing = false; await page.locator('#start').click(); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});

for (const kind of ['doublePiston', 'heelSlide'] as const) {
  test(`${kind} renders normally with impact trails and slide dust`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await begin(page, true, false);
    await page.keyboard.down('d'); await page.clock.runFor(kind === 'doublePiston' ? 1450 : 850); await page.keyboard.up('d');
    await page.clock.runFor(350); await perform(page, kind); await page.clock.runFor(kind === 'doublePiston' ? 520 : 200);
    await expect(page.locator('#arena')).toHaveAttribute('data-player-action', kind);
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-normal-effects.png`) });
    const frames = await page.evaluate(() => (window as Recorded).kickSpecialDraws!);
    expect(frames.some(f => f.pose === (kind === 'doublePiston' ? 19 : 20))).toBe(true);
    expect(errors).toEqual([]);
  });
}
