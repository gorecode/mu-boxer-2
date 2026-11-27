import { expect, test, type Page } from '@playwright/test';

type Draw = { pose: number; x: number; scale: number; dx: number; dy: number };
type Recorded = Window & { crouchDraws?: Draw[] };
async function begin(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-27T09:00:00Z') });
  await page.addInitScript(() => {
    (window as Recorded).crouchDraws = [];
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const arena = document.querySelector<HTMLCanvasElement>('#arena');
        const match = args[0] instanceof HTMLImageElement ? args[0].src.match(/boxer-(\d+)\.webp$/) : null;
        if (context.canvas === arena && match && ['crouchKick', 'crouchSweep'].includes(arena?.dataset.playerAction ?? '')) {
          const m = context.getTransform();
          (window as Recorded).crouchDraws!.push({ pose: Number(match[1]), x: m.e, scale: m.a, dx: args[1], dy: args[2] });
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-27T10:00:00Z'));
  await page.locator('#training-mode').check(); await page.locator('#start').click();
  await page.clock.runFor(1800); await page.locator('#arena').focus();
}

test('crouched N and back N render the selected cels with fixed root and quick crouched return, including early down release', async ({ page }, info) => {
  await begin(page);
  const arena = page.locator('#arena');
  for (const [key, kind, first] of [['n', 'crouchKick', 21], ['n', 'crouchSweep', 23]] as const) {
    await page.evaluate(() => { (window as Recorded).crouchDraws = []; });
    await page.keyboard.down('s');
    if (kind === 'crouchSweep') await page.keyboard.down('a');
    await page.keyboard.down(key); await page.clock.runFor(100);
    await expect(arena).toHaveAttribute('data-player-action', kind);
    await page.keyboard.up('s');
    if (kind === 'crouchSweep') await page.keyboard.up('a');
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-contact.png`) });
    await page.clock.runFor(1000); await expect(arena).toHaveAttribute('data-player-action', '');
    const frames = await page.evaluate(() => (window as Recorded).crouchDraws!);
    expect(frames.map(f => f.pose).filter((p, i, all) => i === 0 || p !== all[i - 1])).toEqual([first, first + 1, first, 5]);
    for (const f of frames) {
      expect(f.x).toBe(430); expect(f.scale).toBeCloseTo(1.19, 6);
      if (f.pose !== 5) { expect(f.dx).toBe(-240); expect(f.dy).toBe(-485); }
    }
    await page.keyboard.up(key);
  }
});

test('touch shortcuts deal low damage once, low guard blocks, and editor previews both contacts', async ({ page }, info) => {
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 800, height: 900 });
  await begin(page);
  for (const [kind, hp, pose] of [['crouchKick', '108 / 120', '22'], ['crouchSweep', '103 / 120', '24']] as const) {
    await page.keyboard.down('d'); await page.clock.runFor(1550); await page.keyboard.up('d');
    const button = page.locator(`[data-input=${kind}]`);
    if (info.project.name === 'mobile') await button.tap(); else await button.click();
    await page.clock.runFor(100); await expect(page.locator('#worker-hp')).toHaveText(hp);
    await page.clock.runFor(1200); await expect(page.locator('#worker-hp')).toHaveText(hp);
    await page.locator('#edit-attack').selectOption(kind); await page.locator('#edit-phase').selectOption('1');
    await expect(page.locator('#edit-pose')).toHaveValue(pose); await expect(page.locator('#edit-pose')).toHaveAttribute('max', '24');
    await page.locator('.arena-shell').screenshot({ path: info.outputPath(`${kind}-editor.png`) });
    await page.locator('#arena').focus(); await page.keyboard.press('r'); await page.clock.runFor(1800);
    await page.locator('#training-dummy').selectOption('guard'); await page.locator('#arena').focus();
    await page.keyboard.down('d'); await page.clock.runFor(1550); await page.keyboard.up('d');
    await button.click(); await page.clock.runFor(250); await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
    await page.locator('#arena').focus(); await page.keyboard.press('r'); await page.clock.runFor(1800);
    await page.locator('#training-dummy').selectOption('idle'); await page.locator('#arena').focus();
  }
});

test('missing crouch contact blocks startup and retry reloads it', async ({ page }) => {
  let missing = true;
  await page.route('**/art/fight/boxer-24.webp', route => missing ? route.abort() : route.continue());
  await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toContainText('boxer-24.webp');
  await expect(page.locator('#arena')).toHaveAttribute('data-loaded', 'false');
  await expect(page.locator('#start')).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ');
  missing = false; await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});
