import { expect, test } from '@playwright/test';

test('separate layered entry keeps both engines equivalent through cuts, overlap and reverse seeks', async ({ page }, testInfo) => {
  await page.goto('./layered.html');
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#play')).toHaveText('Смотреть');
  const times = [0, 799, 800, 1400, 2000, 2299, 2300, 2475, 2650, 4000, 4800, 5050, 5300, 6000, 2475, 0];
  for (const time of times) {
    await page.locator('#seek').fill(String(time));
    const states: number[][] = [];
    for (const engine of ['gsap', 'native']) {
      await page.locator('#engine').selectOption(engine);
      await expect(page.locator('#seek')).toHaveValue(String(time));
      states.push(await page.evaluate(() => ['city', 'rail', 'paper', 'stamp', 'black'].flatMap(id => {
        const style = document.getElementById(id)!.style;
        return [...style.transform.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0])).concat(Number(style.opacity));
      })));
    }
    expect(states[0].length).toBeGreaterThan(10);
    for (const [index, value] of states[0].entries()) expect(value, `layer at ${time}ms`).toBeCloseTo(states[1][index], 4);
  }
  await page.locator('#seek').fill('2650');
  const stage = await page.locator('#layer-stage').boundingBox();
  const paper = await page.locator('#paper').boundingBox();
  const stamp = await page.locator('#stamp').boundingBox();
  expect(paper!.x).toBeGreaterThan(stage!.x);
  expect(paper!.y + paper!.height).toBeLessThan(stage!.y + stage!.height);
  expect(stamp!.x + stamp!.width).toBeLessThan(paper!.x + paper!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#layer-stage').screenshot({ path: testInfo.outputPath('layered.png') });
});

test('layered clock preserves pause, speed, engine switches, shifted lead-in and completion', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./layered.html?engine=native');
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#engine')).toHaveValue('native');
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.locator('#seek').fill('800');
  await page.locator('#speed').selectOption('2');
  await page.locator('#play').click();
  await page.clock.runFor(400);
  const time = Number(await page.locator('#seek').inputValue());
  expect(time).toBeGreaterThan(1570);
  expect(time).toBeLessThan(1630);
  await page.locator('#engine').selectOption('gsap');
  await expect(page.locator('#play')).toHaveText('Смотреть');
  const frozen = await page.locator('#paper').getAttribute('style');
  await page.clock.runFor(1000);
  await expect(page.locator('#seek')).toHaveValue(String(time));
  await expect(page.locator('#paper')).toHaveAttribute('style', frozen!);
  await page.locator('#lead').selectOption('1300');
  await expect(page.locator('#seek')).toHaveAttribute('max', '6500');
  await expect(page.locator('#seek')).toHaveValue(String(time));
  expect(await page.locator('#paper').getAttribute('style')).not.toBe(frozen);
  await page.locator('#restart').click();
  await expect(page.locator('#seek')).toHaveValue('0');
  await page.locator('#play').click();
  await page.clock.runFor(7000);
  await expect(page.locator('#seek')).toHaveValue('6500');
  await expect(page.locator('#play')).toHaveText('Смотреть');
  await expect(page.locator('#black')).toHaveCSS('opacity', '1');
  await page.locator('#play').click();
  await page.clock.runFor(100);
  expect(Number(await page.locator('#seek').inputValue())).toBeLessThan(250);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(page.locator('#play')).toHaveText('Смотреть');
});

test('reduced motion uses static beats and failed art blocks playback until reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/epilogue-city-v1.webp', route => route.abort());
  await page.goto('./layered.html?lead=1300');
  await expect(page.locator('#status')).toContainText('Иллюстрация не загрузилась');
  await expect(page.locator('#play')).toBeDisabled();
  await expect(page.locator('#restart')).toBeDisabled();
  await page.unroute('**/epilogue-city-v1.webp');
  await page.reload();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#seek').fill('1500');
  await expect(page.locator('#paper')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(page.locator('#city')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(page.locator('#stamp')).toHaveCSS('opacity', '0');
  await page.locator('#seek').fill('2800');
  await expect(page.locator('#stamp')).toHaveCSS('opacity', '1');
  await page.locator('#seek').fill('5300');
  await expect(page.locator('#black')).toHaveCSS('opacity', '1');
});
