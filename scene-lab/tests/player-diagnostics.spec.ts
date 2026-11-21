import { expect, test } from '@playwright/test';

test('late clipboard feedback preserves image recovery and fullscreen exit diagnostics', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () =>
          new Promise<void>((resolve) => {
            Object.assign(window, { finishCopy: resolve });
          }),
      },
    });
  });
  await page.goto('./#scene=precinct&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#scrub').fill('9000');
  await page.locator('#share').click();
  await expect.poll(() => page.evaluate(() => 'finishCopy' in window)).toBe(true);
  await page.locator('#art').evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(page.locator('#status')).toHaveAttribute('data-error', 'image');
  const recovery = await page.locator('#status').textContent();
  await page.evaluate(() => (window as unknown as { finishCopy(): void }).finishCopy());
  await expect(page.locator('#status')).toHaveText(recovery!);
  await expect(page.locator('#play')).toBeDisabled();
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
  await page.evaluate(() => {
    const exit = document.exitFullscreen.bind(document);
    document.exitFullscreen = () => {
      document.exitFullscreen = exit;
      return Promise.reject(new Error('Exit failed'));
    };
  });
  await page.locator('#fullscreen').click();
  await expect(page.locator('#status')).toContainText('Не удалось выйти');
  await expect(page.locator('#status')).toBeVisible();
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(page.locator('#status')).toHaveText(recovery!);
});

test('sharing after a failed image load keeps recovery instructions', async ({ page }) => {
  await page.route('**/art/precinct-idle.webp', (route) => route.abort());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} } });
  });
  await page.goto('./#scene=precinct&t=0');
  await expect(page.locator('#status')).toHaveAttribute('data-error', 'image');
  const recovery = await page.locator('#status').textContent();
  await page.locator('#scrub').fill('9000');
  await page.locator('#share').click();
  await expect(page.locator('#status')).toHaveText(recovery!);
  await expect(page.locator('#play')).toBeDisabled();
});
