import { expect, test, type Page } from '@playwright/test';
async function begin(page: Page, training = false): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-21T09:00:00Z') });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-21T10:00:00Z'));
  if (training) await page.locator('#training-mode').check();
  await page.locator('#start').click(); await page.clock.runFor(1800);
}
const num = async (page: Page, key: string) => Number(await page.locator('#arena').getAttribute(`data-${key}`));
async function until(page: Page, key: string, value: string, ms = 4000): Promise<void> {
  for (let i = 0; i < ms/25; i++) {
    if (await page.locator('#arena').getAttribute(`data-${key}`) === value) return;
    await page.clock.runFor(25);
  }
  await expect(page.locator('#arena')).toHaveAttribute(`data-${key}`, value);
}

test('idle far calls a visible two-turn spin; pause freezes travel, guard absorbs and recovery allows retaliation', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await begin(page); const arena = page.locator('#arena');
  await until(page, 'worker-action', 'spin'); await expect(page.locator('#fight-hint')).toContainText('ДВА УДАРА'); await expect(page.locator('#worker-tell')).toBeVisible(); await expect(page.locator('#worker-tell')).toContainText('ДВА УДАРА');
  await expect(page.locator('#worker-state')).toContainText('1/3');
  const x = await num(page, 'worker-x'); await page.clock.runFor(350); expect(await num(page, 'worker-x')).toBe(x);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('worker-spin-telegraph.png') });
  await arena.focus(); await page.keyboard.down('l'); await page.clock.runFor(450);
  expect(await num(page, 'worker-x')).toBeLessThan(x);
  await page.keyboard.press('Escape'); const frozen = await num(page, 'worker-x'); await page.clock.runFor(700); expect(await num(page, 'worker-x')).toBe(frozen);
  await page.keyboard.up('l'); await page.locator('#resume').click(); await page.keyboard.down('l');
  await until(page, 'worker-cel', 'recovery'); await expect(page.locator('#fight-hint')).toContainText('ОКНО ДЛЯ ОТВЕТА');
  await expect(page.locator('#player-hp')).toHaveText('100 / 100'); expect(await num(page, 'player-guard')).toBeLessThan(100);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('worker-spin-recovery.png') });
  await page.keyboard.up('l'); await page.keyboard.down('d'); await page.clock.runFor(170); await page.keyboard.up('d'); await page.keyboard.press('j'); await page.clock.runFor(150);
  await expect(page.locator('#worker-hp')).toHaveText('112 / 120');
  await page.keyboard.press('r'); await expect(arena).toHaveAttribute('data-worker-stage', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

test('editor previews new worker attacks, real damage changes phases, snapshots retain transition and restart clears it', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await begin(page, true);
  const arena = page.locator('#arena');
  for (const kind of ['thrust', 'spin']) {
    await page.locator('#edit-attack').selectOption(kind); await expect(arena).toHaveAttribute('data-worker-action', kind);
    await expect(arena).toHaveAttribute('data-player-action', ''); await expect(arena).toHaveAttribute('data-frozen', 'true');
  }
  async function hit(): Promise<void> {
    await page.locator('#edit-attack').selectOption('jab'); await page.locator('#edit-phase').selectOption('1'); await page.locator('#edit-preview').click();
    await page.locator('#training-step').click();
  }
  for (let i = 0; i < 5; i++) await hit(); await expect(page.locator('#worker-hp')).toHaveText('80 / 120');
  await page.locator('#training-dummy').selectOption('cpu'); await page.locator('#training-step').click();
  await expect(arena).toHaveAttribute('data-worker-stage', '2'); await expect(page.locator('#worker-state')).toContainText('МЕНЯЕТ ХВАТ');
  await page.locator('#training-save').click(); const time = await num(page, 'worker-stage-time');
  await page.clock.runFor(1200); expect(await num(page, 'worker-stage-time')).toBe(time);
  await page.locator('#training-freeze').click(); await page.clock.runFor(1100); await expect(page.locator('#worker-state')).not.toContainText('МЕНЯЕТ ХВАТ');
  await page.locator('#training-load').click(); await expect(arena).toHaveAttribute('data-worker-stage', '2'); expect(await num(page, 'worker-stage-time')).toBe(time);
  await page.locator('#training-dummy').selectOption('idle');
  for (let i = 0; i < 6; i++) await hit(); await expect(page.locator('#worker-hp')).toHaveText('32 / 120');
  await page.locator('#training-dummy').selectOption('cpu'); await page.locator('#training-freeze').click(); await page.clock.runFor(1100); await page.locator('#training-freeze').click();
  await expect(arena).toHaveAttribute('data-worker-stage', '3'); await expect(page.locator('#worker-state')).toContainText('ВЫДЫХАЕТСЯ');
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('worker-phase-three.png') });
  await page.locator('#training-health').click(); await page.locator('#training-step').click(); await expect(arena).toHaveAttribute('data-worker-stage', '3');
  await arena.focus(); await page.keyboard.press('r'); await expect(arena).toHaveAttribute('data-worker-stage', '1');
});

test('spin contact editor renders its selected pose and draggable real hitbox', async ({ page }) => {
  await page.addInitScript(() => {
    const seen = { pose: '', hits: 0 }; (window as Window & { workerPreview?: typeof seen }).workerPreview = seen;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context, args) {
        const image = args[0]; if (image instanceof HTMLImageElement && /worker-\d+\.webp/.test(image.src)) seen.pose = image.src.split('/').pop()!;
        return Reflect.apply(draw, context, args);
      },
    });
    CanvasRenderingContext2D.prototype.strokeRect = new Proxy(CanvasRenderingContext2D.prototype.strokeRect, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        if (context.strokeStyle === '#ff4264') seen.hits++;
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await begin(page, true); await page.locator('#edit-attack').selectOption('spin'); await page.locator('#edit-phase').selectOption('1');
  await expect(page.locator('#arena')).toHaveAttribute('data-worker-cel', 'active');
  expect(await num(page, 'worker-action-time')).toBeGreaterThanOrEqual(.785);
  await page.locator('#edit-pose').fill('0'); await page.locator('#edit-pose').press('Tab');
  const read = () => page.evaluate(() => (window as Window & { workerPreview?: { pose: string; hits: number } }).workerPreview!);
  expect((await read()).pose).toBe('worker-0.webp'); expect((await read()).hits).toBeGreaterThan(0);
  const arena = page.locator('#arena'); await arena.scrollIntoViewIfNeeded(); const r = (await arena.boundingBox())!;
  const width = Math.min(r.width, r.height * 16/9), height = width * 9/16;
  const x = r.x + (r.width - width)/2 + 740 * width/1600, y = r.y + (r.height - height)/2 + 515 * height/900;
  const before = Number(await page.locator('#edit-right').inputValue());
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 15 * width/1600, y, { steps: 3 }); await page.mouse.up();
  expect(Number(await page.locator('#edit-right').inputValue())).toBe(before - 15);
  await page.locator('#edit-defaults').click(); await expect(page.locator('#edit-pose')).toHaveValue('4'); expect((await read()).pose).toBe('worker-4.webp');
});
