import { expect, test } from '@playwright/test';
import { scenes } from '../src/scenes.ts';
import { compileFilm } from '../src/film.ts';

const film = compileFilm(scenes);

test('standalone film is linked from the lab and loads the same player bundle', async ({ page }) => {
  await page.goto('./');
  const player = await page.locator('script[type=module][src]').evaluateAll(scripts => scripts.map(script => script.getAttribute('src')));
  expect(player.length).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Смотреть игрофильм' }).click();
  await expect(page).toHaveURL(/\/mu-boxer\/film.html$/);
  await expect(page).toHaveTitle('Месть боксёра 2 — игрофильм');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#mode-select')).toHaveValue('film');
  await expect(page.locator('#scrub')).toHaveAttribute('max', String(film.scene.duration));
  await expect(page.locator('#cues')).toBeHidden();
  await expect(page.locator('#scene-select')).toBeVisible();
  await expect(page.locator('#start')).toHaveText('Смотреть игрофильм');
  expect(await page.locator('script[type=module][src]').evaluateAll(scripts => scripts.map(script => script.getAttribute('src')))).toEqual(player);
  await page.getByRole('link', { name: 'К сценам' }).click();
  await expect(page.locator('#mode-select')).toHaveValue('scene');
  await expect(page.locator('#cues')).toBeVisible();
});

test('film links keep global time without autoplay and other scene hashes stay in film', async ({ page }) => {
  const chapter = film.chapters.find(chapter => chapter.scene.id === 'bandit')!;
  await page.goto(`./film.html#scene=film&t=${(chapter.start + 1000) / 1000}`);
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#scene-select')).toHaveValue('bandit');
  await expect(page.locator('#scrub')).toHaveValue(String(chapter.start + 1000));
  await expect(page.locator('#start-overlay')).toBeVisible();
  await page.locator('#scrub').fill('300000');
  await page.locator('#share').click();
  const shared = page.url();
  expect(shared).toContain('/film.html#scene=film&t=');
  await page.reload();
  await expect(page).toHaveURL(shared);
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
  await expect(page.locator('#scrub')).toHaveValue('300000');
  for (const hash of ['#scene=worker&t=10', '#scene=missing&t=NaN', '#scene=film&t=-1']) {
    await page.evaluate(hash => { location.hash = hash; }, hash);
    await expect(page.locator('#mode-select')).toHaveValue('film');
    await expect(page.locator('#scrub')).toHaveValue('0');
    await expect(page.locator('#scene-select')).toHaveValue('intro');
  }
});

test('the shared film clock crosses a chapter, flashes on fight entry and stops at the ending', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  const chapter = film.chapters.find(chapter => chapter.scene.id === 'precinct')!;
  await page.goto(`./film.html#scene=film&t=${(chapter.start - 50) / 1000}`);
  await expect(page.locator('#start')).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.locator('#mute').click();
  await page.locator('#start').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
  await page.clock.runFor(100);
  await expect(page.locator('#scene-select')).toHaveValue('precinct');
  await expect(page.locator('#start-overlay')).toBeHidden();
  const fight = chapter.scene.cues.find(cue => cue.fight)!;
  await page.locator('#scrub').fill(String(chapter.start + fight.start));
  await page.locator('#play').click();
  await expect(page.locator('#scene-flash')).toBeVisible();
  await expect(page.locator('#resolve')).toBeHidden();
  await page.clock.runFor(350);
  await expect(page.locator('#scene-flash')).toBeHidden();
  await page.locator('#scrub').fill(String(film.scene.duration - 50));
  await page.locator('#play').click();
  await page.clock.runFor(100);
  await expect(page.locator('#scrub')).toHaveValue(String(film.scene.duration));
  await expect(page.locator('#title-card-title')).toHaveText('КОНЕЦ');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`film touch controls fit ${viewport.width}×${viewport.height} without fullscreen support`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable')); });
    await page.goto('./film.html');
    await expect(page.locator('#start')).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const stage = await page.locator('#stage').boundingBox();
    expect(stage!.width).toBeGreaterThan(250);
    for (const selector of ['#start', '#play', '#mute', '#fullscreen', '#scene-select', '#speed']) {
      const box = await page.locator(selector).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    const controls = await page.locator('.transport-row').boundingBox();
    expect(controls!.y + controls!.height).toBeLessThanOrEqual(viewport.height);
    await page.locator('#fullscreen').click();
    await expect(page.locator('#player')).toHaveClass(/is-expanded/);
    await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#start').click();
    await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
    await page.locator('#fullscreen').click();
    await expect(page.locator('#player')).not.toHaveClass(/is-expanded/);
  });
}

test('a missing late illustration blocks film playback and a reload can recover', async ({ page }) => {
  await page.route('**/art/epilogue-exit-v2.webp', route => route.abort());
  await page.goto('./film.html');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#play')).toBeDisabled();
  await page.unroute('**/art/epilogue-exit-v2.webp');
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#status')).toBeEmpty();
});
