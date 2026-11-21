import { expect, test, type Page } from '@playwright/test';
async function begin(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-21T09:00:00Z') });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-21T10:00:00Z'));
  await page.locator('#training-mode').check(); await page.locator('#start').click(); await page.clock.runFor(1800);
}
const num = async (page: Page, key: string) => Number(await page.locator('#arena').getAttribute(`data-${key}`));

test('standalone uppercut closes normal spacing with a real step, launches once and still whiffs from afar', async ({ page }, info) => {
  await begin(page); const arena = page.locator('#arena'); await arena.focus();
  await page.keyboard.down('d'); await page.clock.runFor(1200); await page.keyboard.up('d');
  const x = await num(page, 'player-x'), distance = await num(page, 'worker-x') - x;
  expect(distance).toBeGreaterThan(300); expect(distance).toBeLessThan(320);
  await page.keyboard.down('s'); await page.keyboard.press('k'); await page.keyboard.up('s'); await page.clock.runFor(150);
  await expect(arena).toHaveAttribute('data-player-action', 'upper'); await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
  expect(await num(page, 'player-x') - x).toBeCloseTo(70, 1);
  await page.clock.runFor(220); await expect(page.locator('#worker-hp')).toHaveText('97 / 120'); expect(await num(page, 'worker-y')).toBeGreaterThan(0);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('uppercut-step.png') });
  await page.clock.runFor(700); await expect(page.locator('#worker-hp')).toHaveText('97 / 120');
  await page.keyboard.press('r'); await page.clock.runFor(1800);
  const farX = await num(page, 'player-x'); await page.keyboard.down('s'); await page.keyboard.press('k'); await page.keyboard.up('s'); await page.clock.runFor(850);
  expect(await num(page, 'player-x') - farX).toBeCloseTo(70, 1); await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
});

test('held high and low guard visibly match real blocks, explain unavailable states and clear on pause or restart', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const seen: string[] = []; (window as Window & { guardShapes?: string[] }).guardShapes = seen;
    CanvasRenderingContext2D.prototype.ellipse = new Proxy(CanvasRenderingContext2D.prototype.ellipse, {
      apply(draw, context, args) {
        const entry = `${args[1]}:${args[2]}:${args[3]}`; if (!seen.includes(entry)) seen.push(entry);
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await begin(page); const arena = page.locator('#arena'), status = page.locator('#guard-state');
  async function proof(name: string): Promise<void> {
    await page.locator('.arena-shell').scrollIntoViewIfNeeded();
    const r = (await page.locator('.arena-shell').boundingBox())!, statusRect = (await status.boundingBox())!;
    await page.screenshot({ path: info.outputPath(name), clip: { ...r, height: r.height + statusRect.height } });
  }
  await expect(page.locator('#block-help')).toContainText('Удерживай L'); await expect(page.locator('#block-help')).toContainText('S + L');
  await arena.focus(); await page.keyboard.down('l'); await page.clock.runFor(40);
  await expect(status).toHaveAttribute('data-state', 'high'); await expect(status).toContainText('БЛОК СТОЯ');
  expect(await page.evaluate(() => (window as Window & { guardShapes?: string[] }).guardShapes)).toContain('-365:65:110');
  await page.keyboard.down('s'); await page.clock.runFor(40); await expect(status).toHaveAttribute('data-state', 'low');
  expect(await page.evaluate(() => (window as Window & { guardShapes?: string[] }).guardShapes)).toContain('-150:65:75');
  await proof('guard-low.png');
  await page.keyboard.up('s'); await page.keyboard.up('l'); await page.clock.runFor(40); await expect(status).toHaveAttribute('data-state', 'idle');
  await page.keyboard.press('k'); await page.clock.runFor(30); await expect(arena).toHaveAttribute('data-player-action', 'heavy');
  await page.keyboard.down('l'); await page.clock.runFor(50);
  await expect(status).toHaveAttribute('data-state', 'unavailable'); await expect(status).toContainText('ЗАВЕРШЕНИЯ УДАРА');
  await page.clock.runFor(700); await expect(status).toHaveAttribute('data-state', 'high');
  await page.keyboard.up('l'); await page.keyboard.press('w'); await page.clock.runFor(30); expect(await num(page, 'player-y')).toBeGreaterThan(0);
  await page.keyboard.down('l'); await page.clock.runFor(100);
  await expect(status).toHaveAttribute('data-state', 'unavailable'); await expect(status).toContainText('В ВОЗДУХЕ');
  await page.clock.runFor(1100); await expect(status).toHaveAttribute('data-state', 'high'); await page.keyboard.up('l');
  await page.keyboard.press('u'); await page.clock.runFor(30); await page.keyboard.down('l'); await page.clock.runFor(40);
  await expect(status).toHaveAttribute('data-state', 'unavailable'); await expect(status).toContainText('ОТСКОКА');
  await page.clock.runFor(200); await expect(status).toHaveAttribute('data-state', 'high'); await page.keyboard.up('l');
  async function incoming(kind: string, low: boolean): Promise<void> {
    await page.keyboard.up('l'); await page.keyboard.up('s');
    await page.locator('#edit-attack').selectOption(kind); await page.locator('#edit-phase').selectOption(kind === 'overhead' ? '0' : '1'); await page.locator('#edit-preview').click();
    if (kind === 'overhead') {
      await page.locator('#training-freeze').click(); await arena.focus(); await page.keyboard.down('d'); await page.clock.runFor(100); await page.keyboard.up('d');
      expect(await num(page, 'worker-x') - await num(page, 'player-x')).toBeLessThan(280);
      if (low) await page.keyboard.down('s'); await page.keyboard.down('l'); await page.clock.runFor(500); await page.locator('#training-freeze').click();
      await page.keyboard.up('l'); await page.keyboard.down('l'); await page.locator('#training-step').click();
    } else {
      await arena.focus(); if (low) await page.keyboard.down('s'); await page.keyboard.down('l'); await page.locator('#training-step').click();
    }
  }
  for (const [kind, low, guard] of [['poke', false, '75%'], ['sweep', true, '70%'], ['overhead', false, '65%']] as const) {
    await page.locator('#training-health').click(); await incoming(kind, low);
    await expect(page.locator('#player-hp')).toHaveText('100 / 100'); await expect(page.locator('#player-guard-value')).toHaveText(guard);
    await expect(status).toHaveAttribute('data-state', 'impact'); await expect(status).toContainText(low ? 'НИЗКИЙ БЛОК' : 'БЛОК СТОЯ');
    for (let i = 0; i < 8; i++) await page.locator('#training-step').click();
    await expect(status).toHaveAttribute('data-state', 'impact');
    if (low) await expect(status).toContainText('НИЗКИЙ БЛОК');
  }
  await page.locator('#training-health').click(); await incoming('overhead', true);
  await expect(page.locator('#player-hp')).toHaveText('78 / 100'); await expect(page.locator('#player-guard-value')).toHaveText('100%');
  await expect(status).toHaveAttribute('data-state', 'unavailable'); await expect(status).toContainText('ОГЛУШЕНИЕ');
  await page.locator('#training-health').click();
  for (let i = 0; i < 4; i++) await incoming('sweep', true);
  await expect(status).toHaveAttribute('data-state', 'broken'); await expect(status).toHaveText('ЗАЩИТА СЛОМАНА');
  await expect(page.locator('#player-guard-value')).toHaveText('0%'); await expect(page.locator('#player-hp')).toHaveText('100 / 100');
  await proof('guard-broken.png');
  await page.keyboard.up('l'); await page.keyboard.up('s'); await page.locator('#training-freeze').click(); await page.clock.runFor(1100);
  expect(await num(page, 'player-guard')).toBeGreaterThan(0); await expect(status).toHaveAttribute('data-state', 'idle');
  await arena.focus(); await page.keyboard.down('l'); await page.clock.runFor(40); await page.keyboard.press('Escape');
  await expect(status).toHaveAttribute('data-state', 'inactive'); await page.locator('#resume').click(); await page.clock.runFor(40);
  await expect(status).toHaveAttribute('data-state', 'idle'); await page.keyboard.up('l');
  if (info.project.name === 'mobile') {
    await page.locator('[data-input="block"]').scrollIntoViewIfNeeded();
    const down = (await page.locator('[data-input="down"]').boundingBox())!, block = (await page.locator('[data-input="block"]').boundingBox())!;
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [down, block].map((r, id) => ({ id, x: r.x + r.width/2, y: r.y + r.height/2 })) });
    await page.clock.runFor(50); await expect(status).toHaveAttribute('data-state', 'low');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.clock.runFor(40); await expect(status).toHaveAttribute('data-state', 'idle');
    await session.detach();
  }
  await page.keyboard.press('r'); await expect(status).toHaveAttribute('data-state', 'inactive'); await expect(page.locator('#player-guard-value')).toHaveText('100%');
  await page.clock.runFor(1800); await expect(status).toHaveAttribute('data-state', 'idle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});
