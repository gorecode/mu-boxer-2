import { expect, test } from '@playwright/test';
import { scenes } from '../src/scenes.ts';
import { compileFilm } from '../src/film.ts';

const film = compileFilm(scenes);
const fights = scenes.flatMap(scene => scene.cues.filter((cue, index) => cue.fight && !scene.cues[index - 1]?.fight).map(cue => ({ scene, cue })));

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`every fight title flashes exactly on entry and settles safely: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
    await page.goto('./');
    await expect(page.locator('#start')).toBeEnabled();
    await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
    expect(fights).toHaveLength(7);
    for (const { scene, cue } of fights) {
      await page.locator('#scene-select').selectOption(scene.id);
      await expect(page.locator('#start')).toBeEnabled();
      await page.locator('#scrub').fill(String(cue.start - 1));
      await expect(page.locator('#fight')).toBeHidden();
      await expect(page.locator('#scene-flash')).toBeHidden();
      await page.locator('#scrub').fill(String(cue.start));
      await expect(page.locator('#fight')).toBeVisible();
      await expect(page.locator('#scene-flash')).toBeHidden();
      await page.locator('#play').click();
      if (reducedMotion === 'reduce') await expect(page.locator('#scene-flash')).toBeHidden();
      else await expect(page.locator('#scene-flash')).toBeVisible();
      await page.clock.runFor(60);
      if (reducedMotion === 'no-preference') {
        const opacity = Number(await page.locator('#scene-flash').evaluate(element => (element as HTMLElement).style.opacity));
        expect(opacity).toBeGreaterThan(0);
        expect(opacity).toBeLessThan(0.8);
      }
      await page.locator('#play').click();
      await expect(page.locator('#scene-flash')).toBeHidden();
      await page.locator('#scrub').fill(String(cue.start + 120));
      await page.locator('#play').click();
      await expect(page.locator('#scene-flash')).toBeHidden();
      await page.clock.runFor(250);
      expect(await page.locator('#fight').evaluate(element => (element as HTMLElement).style.getPropertyValue('--fight-scale'))).toBe('1');
      const stage = await page.locator('#stage').boundingBox();
      for (const selector of ['.versus', '#resolve']) {
        const box = await page.locator(selector).boundingBox();
        expect(box!.y).toBeGreaterThanOrEqual(stage!.y);
        expect(box!.y + box!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
        expect(box!.x).toBeGreaterThanOrEqual(stage!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
      }
      await page.locator('#play').click();
    }
  });
}

test('film uses the same flash and title motion at chapter-local boundaries without a second start', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./#scene=film&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  for (const { scene, cue } of fights) {
    const chapter = film.chapters.find(chapter => chapter.scene.id === scene.id)!;
    await page.locator('#scrub').fill(String(chapter.start + cue.start));
    await page.locator('#play').click();
    await expect(page.locator('#scene-select')).toHaveValue(scene.id);
    await expect(page.locator('#scene-flash')).toBeVisible();
    await expect(page.locator('#fight')).toBeVisible();
    await page.clock.runFor(350);
    await expect(page.locator('#scene-flash')).toBeHidden();
    await page.locator('#play').click();
  }
  const ending = film.chapters.find(chapter => chapter.scene.id === 'epilogue')!;
  const title = ending.scene.cues.find(cue => cue.titleCard)!;
  await page.locator('#scrub').fill(String(ending.start + title.start));
  await expect(page.locator('#title-card')).toHaveCSS('opacity', '0');
  await page.locator('#play').click();
  await page.clock.runFor(500);
  await expect(page.locator('#title-card')).toHaveCSS('opacity', '1');
});
