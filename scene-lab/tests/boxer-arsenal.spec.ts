import { expect, test, type Page } from '@playwright/test';
test.setTimeout(60_000);
async function begin(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-21T09:00:00Z') });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-21T10:00:00Z'));
  await page.locator('#training-mode').check(); await page.locator('#start').click(); await page.clock.runFor(1800);
}
const num = async (page: Page, key: string) => Number(await page.locator('#arena').getAttribute(`data-${key}`));
async function position(page: Page, ms: number): Promise<void> {
  await page.locator('#arena').focus(); await page.keyboard.press('r'); await page.clock.runFor(1800);
  await page.keyboard.down('d'); await page.clock.runFor(ms); await page.keyboard.up('d');
}

async function command(page: Page, kind: string): Promise<void> {
  if (kind === 'long') { await page.keyboard.press('d'); await page.keyboard.down('d'); }
  if (kind === 'overhand') await page.keyboard.down('w');
  if (kind === 'backfist') await page.keyboard.down('a');
  await page.keyboard.down('k');
}
async function release(page: Page): Promise<void> { for (const key of ['k', 'd', 's', 'a', 'w']) await page.keyboard.up(key); }

test('MK commands perform distinct grounded attacks, long reaches with its real step and holding never repeats', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await begin(page); const arena = page.locator('#arena');
  for (const [kind, walk, hp] of [['long', 880, '106 / 120'], ['overhand', 1500, '98 / 120'], ['backfist', 1500, '102 / 120']] as const) {
    await position(page, walk); const x = await num(page, 'player-x');
    await command(page, kind); await page.clock.runFor(180); await expect(arena).toHaveAttribute('data-player-action', kind);
    await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
    if (kind === 'long') expect(await num(page, 'player-x') - x).toBeCloseTo(110, 1);
    await page.clock.runFor(350); await expect(page.locator('#worker-hp')).toHaveText(hp);
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}.png`) });
    await page.clock.runFor(1000); await expect(page.locator('#worker-hp')).toHaveText(hp); await expect(arena).toHaveAttribute('data-player-action', ''); await release(page);
  }
  await position(page, 880); await page.keyboard.press('Space'); await page.clock.runFor(50);
  await command(page, 'long'); await release(page); await page.clock.runFor(150); await expect(arena).toHaveAttribute('data-player-action', '');
  await page.clock.runFor(1100); await expect(arena).toHaveAttribute('data-player-action', '');
  await command(page, 'overhand'); await release(page); await page.clock.runFor(30); await expect(arena).toHaveAttribute('data-player-action', 'overhand');
  await page.keyboard.press('Escape'); const time = await num(page, 'player-action-time'); await page.clock.runFor(400); expect(await num(page, 'player-action-time')).toBe(time);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('new touch commands and editor poses/hitboxes work, with a visible backfist turn and overhand lean', async ({ page }, info) => {
  await page.addInitScript(() => {
    const seen = { turns: 0, leans: 0, hits: 0 }; (window as Window & { arsenalDraws?: typeof seen }).arsenalDraws = seen;
    CanvasRenderingContext2D.prototype.scale = new Proxy(CanvasRenderingContext2D.prototype.scale, {
      apply(draw, context, args: number[]) { if (Math.abs(args[0]) >= .3 && Math.abs(args[0]) < .99 && args[1] === 1) seen.turns++; return Reflect.apply(draw, context, args); },
    });
    CanvasRenderingContext2D.prototype.rotate = new Proxy(CanvasRenderingContext2D.prototype.rotate, {
      apply(draw, context, args: number[]) { if (args[0] > .2 && args[0] < .5) seen.leans++; return Reflect.apply(draw, context, args); },
    });
    CanvasRenderingContext2D.prototype.strokeRect = new Proxy(CanvasRenderingContext2D.prototype.strokeRect, {
      apply(draw, context: CanvasRenderingContext2D, args) { if (context.strokeStyle === '#ff4264') seen.hits++; return Reflect.apply(draw, context, args); },
    });
  });
  await begin(page); const arena = page.locator('#arena'); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const [kind, hp] of [['long', '106 / 120'], ['overhand', '98 / 120'], ['backfist', '102 / 120']] as const) {
    await position(page, 1500);
    if (info.project.name === 'mobile') await page.locator(`[data-input=${kind}]`).tap(); else { await command(page, kind); await release(page); }
    await page.clock.runFor(40); await expect(arena).toHaveAttribute('data-player-action', kind);
    if (kind === 'backfist') await page.locator('.arena-shell').screenshot({ path: info.outputPath('backfist-turn.png') });
    await page.clock.runFor(500); await expect(page.locator('#worker-hp')).toHaveText(hp);
  }
  for (const kind of ['long', 'overhand', 'backfist']) {
    await page.locator('#edit-attack').selectOption(kind); await page.locator('#edit-phase').selectOption('1');
    await expect(arena).toHaveAttribute('data-player-action', kind); await expect(arena).toHaveAttribute('data-worker-action', ''); await expect(arena).toHaveAttribute('data-player-cel', 'active');
  }
  const seen = await page.evaluate(() => (window as Window & { arsenalDraws?: { turns: number; leans: number; hits: number } }).arsenalDraws!);
  expect(seen.turns).toBeGreaterThan(0); expect(seen.leans).toBeGreaterThan(0); expect(seen.hits).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

test('direction buttons compose MK chords and consecutive light presses use different hands', async ({ page }, info) => {
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 800, height: 900 });
  await begin(page); const arena = page.locator('#arena');
  for (const [kind, direction] of [['long', 'right'], ['overhand', 'up'], ['backfist', 'left']] as const) {
    await position(page, 1500);
    const button = page.locator(`[data-input=${direction}]`);
    await button.scrollIntoViewIfNeeded();
    if (info.project.name === 'mobile') {
      if (kind === 'long') await button.tap();
      const buttons = await Promise.all([button.boundingBox(), page.locator('[data-input=heavy]').boundingBox()]);
      const points = buttons.map((r, id) => ({ id, x: r!.x + r!.width / 2, y: r!.y + r!.height / 2 }));
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
    } else {
      if (kind === 'long') await button.click();
      const bounds = (await button.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
      await page.keyboard.press('k'); await page.mouse.up();
    }
    await page.clock.runFor(30);
    await expect(arena).toHaveAttribute('data-player-action', kind);
  }
  await position(page, 1500); await page.locator('[data-input=light]').click(); await page.clock.runFor(130);
  await expect(arena).toHaveAttribute('data-player-action', 'jab');
  await page.locator('[data-input=light]').click(); await page.clock.runFor(260);
  await expect(arena).toHaveAttribute('data-player-action', 'cross'); await expect(arena).toHaveAttribute('data-combo', '2');
  await expect(page.locator('#worker-hp')).toHaveText('104 / 120');
});
