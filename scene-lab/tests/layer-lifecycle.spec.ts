import { expect, test } from '@playwright/test';

type DecodeProbe = { decodes: { resolve(): void; reject(reason: Error): void }[] };

for (const staleResult of ['success', 'failure']) {
  test(`StrictMode ignores stale image decoding ${staleResult}`, async ({ page }) => {
    await page.addInitScript(() => {
      const probe: DecodeProbe = { decodes: [] };
      Object.assign(window, probe);
      HTMLImageElement.prototype.decode = () =>
        new Promise<void>((resolve, reject) => {
          probe.decodes.push({ resolve, reject });
        });
    });
    await page.goto('http://127.0.0.1:4198/mu-boxer/tests/fixtures/lifecycle.html?view=layers');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as DecodeProbe).decodes.length))
      .toBe(2);
    await expect(page.locator('#play')).toBeDisabled();
    await page.evaluate(async (result) => {
      const stale = (window as unknown as DecodeProbe).decodes[0];
      if (result === 'success') stale.resolve();
      else stale.reject(new Error('Stale decoding failed'));
      await new Promise(requestAnimationFrame);
    }, staleResult);
    await expect(page.locator('#play')).toBeDisabled();
    await expect(page.locator('#status')).toHaveText('Загрузка иллюстрации…');
    await page.evaluate(async (result) => {
      const active = (window as unknown as DecodeProbe).decodes[1];
      if (result === 'success') active.reject(new Error('Active decoding failed'));
      else active.resolve();
      await new Promise(requestAnimationFrame);
    }, staleResult);
    if (staleResult === 'success') {
      await expect(page.locator('#play')).toBeDisabled();
      await expect(page.locator('#status')).toContainText('Обновите страницу');
    } else {
      await expect(page.locator('#play')).toBeEnabled();
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Пауза');
    }
  });
}
