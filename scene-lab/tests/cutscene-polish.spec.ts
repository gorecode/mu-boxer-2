import { expect, test } from '@playwright/test';
import { scenes } from '../src/scenes.ts';
import { compileFilm } from '../src/film.ts';

const scene = (id: string) => scenes.find(scene => scene.id === id)!;
const cue = (id: string, name: string) => scene(id).cues.find(cue => cue.id === name)!;

test('the repeated question finishes before the explanatory gesture appears during playback', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./#scene=animator&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.locator('#mute').click();
  const question = cue('animator', 'gesture');
  await page.locator('#scrub').fill(String(question.start + question.speech.duration));
  await expect(page.locator('#caption-typed')).toHaveText('Я спросил: тебе смешно?');
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-wide-v2.webp$/);
  await page.locator('#play').click();
  await page.clock.runFor(400);
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-wide-v2.webp$/);
  await page.clock.runFor(300);
  await expect(page.locator('#art')).toHaveAttribute('src', /animator-gesture-v2.webp$/);
  await expect(page.locator('#caption-typed')).toHaveText('');
  await page.clock.runFor(400);
  await expect(page.locator('#caption-typed')).toHaveText('');
  await page.clock.runFor(500);
  await expect(page.locator('#caption-typed')).toContainText('Но');
});

test('queue keeps the neutral face through the isolated But and changes on the quick punchline', async ({ page }) => {
  await page.goto('./#scene=queue&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  const but = cue('queue', 'but'), forced = cue('queue', 'forced');
  await page.locator('#scrub').fill(String(but.end - 1));
  await expect(page.locator('#art')).toHaveAttribute('src', /boxer-thinking.webp$/);
  await expect(page.locator('#caption-typed')).toHaveText('Но.');
  await page.locator('#scrub').fill(String(forced.start));
  await expect(page.locator('#art')).toHaveAttribute('src', /queue-boxer-ready.webp$/);
  await expect(page.locator('#caption-typed')).toHaveText('');
  await page.locator('#scrub').fill(String(forced.end - 1));
  await expect(page.locator('#caption-typed')).toHaveText('Она не оставила мне выбора.');
  await expect(page.locator('#fight')).toBeHidden();
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`city reveal remains after the spoken city in separate scene and film: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('./#scene=epilogue&t=0');
    await expect(page.locator('#start')).toBeEnabled();
    const city = cue('epilogue', 'city');
    for (const offset of [0, compileFilm(scenes).chapters.at(-1)!.start]) {
      if (offset) {
        await page.locator('#mode-select').selectOption('film');
        await expect(page.locator('#start')).toBeEnabled();
      }
      await page.locator('#scrub').fill(String(offset + city.start + 1399));
      await expect(page.locator('#art')).toHaveAttribute('src', /epilogue-doorway-tense-v1.webp$/);
      await expect(page.locator('#caption-typed')).toHaveText('Этот город…');
      await page.locator('#scrub').fill(String(offset + city.start + 1400));
      await expect(page.locator('#art')).toHaveAttribute('src', /epilogue-city-v1.webp$/);
      await expect(page.locator('#caption-typed')).toHaveText('Этот город…');
      await page.locator('#scrub').fill(String(offset + city.start));
      await expect(page.locator('#art')).toHaveAttribute('src', /epilogue-doorway-tense-v1.webp$/);
      await expect(page.locator('#caption-typed')).toHaveText('');
    }
  });
}
