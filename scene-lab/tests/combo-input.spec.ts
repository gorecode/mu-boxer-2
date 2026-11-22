import { expect, test, type Page } from '@playwright/test';
test.setTimeout(60_000);
async function begin(page: Page, training = true) {
  await page.clock.install({ time: new Date('2026-11-22T09:00:00Z') });
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-22T10:00:00Z'));
  if (training) await page.locator('#training-mode').check();
  await page.locator('#start').click(); await page.clock.runFor(1800);
}
async function close(page: Page) {
  await page.locator('#arena').focus(); await page.keyboard.down('d'); await page.clock.runFor(1500); await page.keyboard.up('d');
}
for (const training of [true, false]) {
  test(`released directional specials are recognized visibly in ${training ? 'training' : 'a normal fight'}`, async ({ page }) => {
    await begin(page, training); const arena = page.locator('#arena');
    for (const [key, kind, label] of [['s', 'upper', 'АППЕРКОТ'], ['w', 'overhand', 'СВЕРХУ'], ['a', 'backfist', 'БЭКФИСТ'], ['d', 'long', 'ДЛИННЫЙ ПРЯМОЙ']] as const) {
      await arena.focus(); await page.keyboard.press('r'); await page.clock.runFor(1800);
      if (kind === 'upper' || kind === 'overhand') { await page.keyboard.down(key); await page.clock.runFor(500); await page.keyboard.up(key); }
      else await page.keyboard.press(key);
      await page.clock.runFor(40);
      if (kind === 'long') { await page.keyboard.press(key); await page.clock.runFor(40); }
      await page.keyboard.press('k'); await page.clock.runFor(30);
      await expect(arena).toHaveAttribute('data-player-action', kind); await expect(page.locator('#player-technique')).toContainText(label);
    }
  });
}
test('rapid J J K works before contact, including all taps between render frames, and block cancels the queued series', async ({ page }, info) => {
  await begin(page); const arena = page.locator('#arena');
  for (const gap of [0, 80, 180]) {
    await arena.focus(); await page.keyboard.press('r'); await page.clock.runFor(1800); await close(page);
    await page.locator('#training-dummy').selectOption('after-hit'); await arena.focus();
    if (info.project.name === 'mobile' && gap === 0) {
      await page.locator('[data-input=light]').tap(); await page.locator('[data-input=light]').tap(); await page.locator('[data-input=heavy]').tap();
    } else {
      await page.keyboard.press('j'); if (gap) await page.clock.runFor(gap);
      await page.keyboard.press('j'); if (gap) await page.clock.runFor(gap);
      await page.keyboard.press('k');
    }
    await page.clock.runFor(850);
    await expect(arena).toHaveAttribute('data-combo', '3'); await expect(page.locator('#worker-hp')).toHaveText('90 / 120');
    await expect(arena).toHaveAttribute('data-gap', 'false');
  }
  await page.keyboard.press('r'); await page.clock.runFor(1800); await close(page);
  await page.locator('#training-dummy').selectOption('guard'); await arena.focus();
  await page.keyboard.press('j'); await page.keyboard.press('j'); await page.keyboard.press('k'); await page.clock.runFor(900);
  await expect(page.locator('#worker-hp')).toHaveText('120 / 120'); await expect(arena).toHaveAttribute('data-combo-queue', '');
});
test('queued double-light-heavy also connects in a real fight after blocking the shovel spin', async ({ page }) => {
  await begin(page, false); const arena = page.locator('#arena');
  for (let i = 0; i < 100 && await arena.getAttribute('data-worker-action') !== 'spin'; i++) await page.clock.runFor(25);
  await expect(arena).toHaveAttribute('data-worker-action', 'spin'); await page.keyboard.down('l');
  for (let i = 0; i < 100 && await arena.getAttribute('data-worker-cel') !== 'recovery'; i++) await page.clock.runFor(25);
  await expect(arena).toHaveAttribute('data-worker-cel', 'recovery'); await page.keyboard.up('l');
  await page.keyboard.press('j'); await page.clock.runFor(80); await page.keyboard.press('j'); await page.clock.runFor(80);
  await page.keyboard.press('k'); await page.clock.runFor(750);
  await expect(arena).toHaveAttribute('data-combo', '3'); await expect(page.locator('#worker-hp')).toHaveText('90 / 120');
});
