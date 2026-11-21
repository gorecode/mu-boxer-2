import { expect, test } from '@playwright/test';
import { scenes } from '../src/scenes.ts';
import { compileFilm } from '../src/film.ts';
import { visualAt } from '../src/scene.ts';

const scene = scenes.find(scene => scene.id === 'slider')!;
const chapter = compileFilm(scenes).chapters.find(chapter => chapter.scene.id === 'slider')!;

test('GSAP preserves authored camera positions in every scene after forward and backward seeks', async ({ page }) => {
  for (const source of scenes) {
    await page.goto(`./#scene=${source.id}&t=0`);
    await expect(page.locator('#start')).toBeEnabled();
    const moving = source.cues.flatMap(cue => (cue.shots ?? []).flatMap((shot, index, shots) => shot.cameraEnd
      ? [cue.start + shot.at, Math.round(cue.start + (shot.at + (shots[index + 1]?.at ?? cue.duration)) / 2)]
      : []));
    for (const time of [0, ...moving, source.duration, ...moving.toReversed(), 0]) {
      await page.locator('#scrub').fill(String(time));
      const camera = await page.locator('#art').evaluate(image => {
        const style = (image as HTMLElement).style;
        const [x, y] = style.transformOrigin.split(' ').map(parseFloat);
        return { scale: Number(style.transform.match(/scale\(([^)]+)\)/)![1]), x, y };
      });
      const expected = visualAt(source, time).camera;
      expect(camera.scale).toBeCloseTo(expected.scale, 5);
      for (const key of ['x', 'y'] as const) expect(camera[key]).toBeCloseTo(expected[key], 3);
      await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
    }
  }
});

test('GSAP follows the player clock at 2x, freezes on pause and uses local film time', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./#scene=slider&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.locator('#mute').click();
  await page.locator('#speed').selectOption('2');
  await page.locator('#scrub').fill('8350');
  await page.locator('#play').click();
  await page.clock.runFor(400);
  const time = Number(await page.locator('#scrub').inputValue());
  expect(time).toBeGreaterThan(9100);
  expect(time).toBeLessThan(9200);
  const expected = visualAt(scene, time).camera;
  const scale = await page.locator('#art').evaluate(image => Number((image as HTMLElement).style.transform.match(/scale\(([^)]+)\)/)![1]));
  expect(scale).toBeCloseTo(expected.scale, 5);
  await page.locator('#play').click();
  const frozen = await page.locator('#art').getAttribute('style');
  await page.clock.runFor(1000);
  await expect(page.locator('#art')).toHaveAttribute('style', frozen!);
  await page.locator('#mode-select').selectOption('film');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#scrub').fill(String(chapter.start + 9225));
  await expect(page.locator('#scene-select')).toHaveValue('slider');
  await expect(page.locator('#art')).toHaveCSS('transform', 'matrix(1.7, 0, 0, 1.7, 0, 0)');
  await page.locator('#scrub').fill(String(chapter.start + 1275));
  await expect(page.locator('#art')).toHaveCSS('transform', 'matrix(1.8, 0, 0, 1.8, 0, 0)');
  await page.locator('#mode-select').selectOption('scene');
  await expect(page.locator('#art')).toHaveCSS('transform', 'matrix(1.8, 0, 0, 1.8, 0, 0)');
  await page.locator('#scene-select').selectOption('precinct');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#scene-select').selectOption('slider');
  await expect(page.locator('#art')).toHaveCSS('transform', 'matrix(2.6, 0, 0, 2.6, 0, 0)');
});

test('reduced motion keeps shot-start framing and preserves cuts with GSAP enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#scene=slider&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#scrub').fill('9225');
  await expect(page.locator('#art')).toHaveCSS('transform', 'matrix(2.4, 0, 0, 2.4, 0, 0)');
  await page.locator('#scrub').fill('10100');
  await expect(page.locator('#art')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#scrub').fill('9225');
  await expect(page.locator('#art')).toHaveCSS('transform', 'matrix(1.7, 0, 0, 1.7, 0, 0)');
});
