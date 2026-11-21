import { expect, test } from '@playwright/test';

test('queue deep link shows its own intro, approved dialogue, deadpan excuse and opponent', async ({ page }) => {
  await page.goto('./#scene=queue&t=0');
  await expect(page.locator('#scene-select')).toHaveValue('queue');
  await expect(page.locator('#title')).toHaveText('Только через мой труп');
  await expect(page.locator('#story-intro')).toHaveText('К другим сотрудникам.');
  await expect(page.locator('#story-location')).toHaveText('После боя с Анжеликой. МФЦ.');
  await expect(page.locator('#story-duration')).toContainText('40 с');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#art')).toHaveAttribute('src', /queue-aftermath-v2.webp$/);
  expect(await page.locator('#art').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.locator('[data-cue=ultimatum]').click();
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect(page.locator('#caption-typed')).toHaveText('Мужчина. Только через мой труп.');
  await expect(page.locator('#art')).toHaveAttribute('src', /queue-grandma.webp$/);
  await page.locator('[data-cue=thinking]').click();
  await expect(page.locator('#art')).toHaveAttribute('src', /boxer-thinking.webp$/);
  await expect(page.locator('#caption-typed')).toHaveText('');
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect(page.locator('#caption-typed')).toHaveText('Убивать эту женщину я не собирался.');
  await expect(page.locator('#art')).toHaveAttribute('src', /queue-boxer-ready.webp$/);
  await expect(page.locator('#caption-typed')).toHaveText('Но она не оставила мне выбора.');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'Ссылка на этот момент' }).click();
  const link = page.url();
  await page.reload();
  await expect(page.locator('#scene-select')).toHaveValue('queue');
  await expect(page).toHaveURL(link);
  await expect(page.locator('#caption-typed')).toHaveText('Но она не оставила мне выбора.');
  await page.locator('[data-cue=fight]').click();
  await expect(page.locator('#fight')).toBeVisible();
  await expect(page.locator('#opponent')).toHaveText('БАБКИ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('switching scenes pauses real audio, resets position and restores the selected scene introduction', async ({ page }) => {
  await page.addInitScript(() => {
    const browser = window as unknown as Window & { sceneContexts: AudioContext[] };
    browser.sceneContexts = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor() { super(); browser.sceneContexts.push(this); }
    };
  });
  await page.goto('./#scene=precinct&t=22.4');
  await page.getByRole('button', { name: 'Смотреть с этого момента', exact: true }).click();
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('queue');
  await expect(page.locator('#scrub')).toHaveValue('0');
  await expect(page.locator('#story-intro')).toBeVisible();
  await expect(page.locator('#story-intro')).toHaveText('К другим сотрудникам.');
  await expect(page.locator('#art')).toHaveAttribute('src', /queue-aftermath-v2.webp$/);
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { sceneContexts: AudioContext[] }).sceneContexts[0].state)).toBe('suspended');
  await page.waitForTimeout(100);
  await expect(page.locator('#scrub')).toHaveValue('0');
  await page.getByRole('button', { name: 'Смотреть сцену', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { sceneContexts: AudioContext[] }).sceneContexts[0].state)).toBe('running');
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('precinct');
  await expect(page.locator('#story-intro')).toHaveText('Мне только\nсправку получить.');
  await expect(page.locator('#story-duration')).toContainText('31.1 с');
  await expect(page.locator('#scrub')).toHaveValue('0');
  await expect(page.locator('#art')).toHaveAttribute('src', /worker-aftermath-v2.webp$/);
  expect(await page.evaluate(() => (window as unknown as Window & { sceneContexts: AudioContext[] }).sceneContexts.length)).toBe(1);
});

test('a missing later queue panel blocks start and another scene can still be reviewed', async ({ page }) => {
  await page.route('**/art/queue-boxer-ready.webp', (route) => route.abort());
  await page.goto('./#scene=queue&t=0');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#play')).toBeDisabled();
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('precinct');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#status')).not.toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#art')).toHaveAttribute('src', /worker-aftermath-v2.webp$/);
});

test('cross-scene hash links preserve the chosen playback speed in the actual timeline', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./');
  await expect(page.locator('#start')).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
  await page.getByLabel('Скорость').selectOption('2');
  await page.evaluate(() => { location.hash = 'scene=queue&t=28'; });
  await expect(page.locator('#scene-select')).toHaveValue('queue');
  await expect(page.locator('#scrub')).toHaveValue('28000');
  await expect(page.locator('#play')).toBeEnabled();
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await page.clock.runFor(200);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const position = Number(await page.locator('#scrub').inputValue());
  expect(position).toBeGreaterThan(28300);
  expect(position).toBeLessThan(28500);
  await expect(page.locator('#caption-typed')).not.toHaveText('');
  await expect(page.locator('#art')).toHaveAttribute('src', /boxer-thinking.webp$/);
});

test('calling ticket 111 schedules its two-note chime through real Web Audio', async ({ page }) => {
  await page.addInitScript(() => {
    const browser = window as unknown as Window & { queuePitches: number[] };
    browser.queuePitches = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      createOscillator(): OscillatorNode {
        const oscillator = super.createOscillator();
        const schedule = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (value, time) => {
          browser.queuePitches.push(value);
          return schedule(value, time);
        };
        return oscillator;
      }
    };
  });
  await page.goto('./#scene=queue&t=14.5');
  await page.getByRole('button', { name: 'Смотреть с этого момента', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { queuePitches: number[] }).queuePitches)).toEqual(expect.arrayContaining([880, 1244]));
  await expect(page.locator('[data-cue=called]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#art')).toHaveAttribute('src', /queue-wide.webp$/);
});

test('transition art, camera and subtitle boundaries survive seeking before the existing queue', async ({ page }) => {
  await page.goto('./#scene=queue&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  for (const [time, art, text] of [[0, 'aftermath-v2', ''], [3500, 'aftermath-v2', 'Мои способности её убедили.'],
    [4200, 'entrance-v1', ''], [8500, 'entrance-v1', 'Но за справкой пришлось обратиться к другим сотрудникам.'],
    [9200, 'terminal-v2', ''], [12900, 'terminal-v2', 'Здесь всё было организовано.'],
    [13000, 'ticket', ''], [14500, 'wide', ''], [16000, 'grandma', '']] as const) {
    await page.locator('#scrub').fill(String(time));
    await expect(page.locator('#art')).toHaveAttribute('src', new RegExp(`queue-${art}.webp$`));
    await expect(page.locator('#caption-typed')).toHaveText(text);
    expect(await page.locator('#art').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('#fight')).toBeHidden();
  }
  await page.locator('#scrub').fill('350');
  const close = await page.locator('#art').getAttribute('style');
  await page.locator('#scrub').fill('2300');
  const full = await page.locator('#art').getAttribute('style');
  expect(full).not.toEqual(close);
  await page.locator('#scrub').fill('4199');
  expect(await page.locator('#art').getAttribute('style')).toEqual(full);
  await page.locator('#scrub').fill('0');
  await expect(page.locator('#caption-typed')).toHaveText('');
});

test('new transition artwork failures block start and recover on retry', async ({ page }) => {
  await page.route('**/art/queue-terminal-v2.webp', route => route.abort());
  await page.goto('./#scene=queue&t=0');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await page.unroute('**/art/queue-terminal-v2.webp');
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('[data-cue=terminal]').click();
  await expect(page.locator('#art')).toHaveAttribute('src', /queue-terminal-v2.webp$/);
});
