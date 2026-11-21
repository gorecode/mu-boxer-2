import { expect, test } from '@playwright/test';

interface AudioWindow extends Window { audioContexts: (AudioContext & { meter: AnalyserNode })[] }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const browser = window as unknown as AudioWindow;
    browser.audioContexts = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor() {
        super();
        const meter = this.createAnalyser();
        meter.fftSize = 2048;
        const context = Object.assign(this, { meter });
        browser.audioContexts.push(context);
        const original = this.createGain.bind(this);
        let first = true;
        this.createGain = () => {
          const gain = original();
          if (first) { gain.connect(meter); first = false; }
          return gain;
        };
      }
    };
  });
});

test('starts by gesture; renders actual Web Audio signal; pauses and resumes without time drift', async ({ page }) => {
  await page.goto('./#scene=precinct&t=0');
  await expect(page.getByRole('button', { name: 'Смотреть сцену', exact: true })).toBeEnabled();
  await expect(page.locator('#scrub')).toHaveValue('0');
  await expect(page.locator('#subtitle')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as AudioWindow).audioContexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Смотреть сцену', exact: true }).click();
  await expect(page.locator('#caption-typed')).toContainText('Рабочий');
  await expect.poll(() => page.evaluate(() => {
    const context = (window as unknown as AudioWindow).audioContexts[0];
    const buffer = new Float32Array(2048);
    context.meter.getFloatTimeDomainData(buffer);
    return buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length;
  })).toBeGreaterThan(0.000001);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const time = await page.locator('#scrub').inputValue();
  const caption = await page.locator('#caption-typed').textContent();
  expect(caption!.length).toBeLessThan('Рабочий больше не возражал. Я прошёл к участковому.'.length);
  await expect.poll(() => page.evaluate(() => (window as unknown as AudioWindow).audioContexts[0].state)).toBe('suspended');
  await page.waitForTimeout(200);
  await expect(page.locator('#scrub')).toHaveValue(time);
  await expect(page.locator('#caption-typed')).toHaveText(caption!);
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('#scrub').inputValue())).toBeGreaterThan(Number(time));
});

test('cue review, speed, mute, seek to ending, replay, and share link work', async ({ page }) => {
  await page.goto('./#scene=precinct&t=0');
  await page.locator('[data-cue="shoes"]').click();
  await expect(page.locator('#subtitle')).toBeHidden();
  await expect(page.locator('#art')).toHaveAttribute('src', /art\/precinct\.webp$/);
  await expect(page.locator('#paused-mark')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as AudioWindow).audioContexts.length)).toBe(0);
  await page.getByLabel('Скорость').selectOption('2');
  await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as AudioWindow).audioContexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByLabel('Позиция сцены').press('End');
  await expect(page.locator('#fight')).toBeVisible();
  await expect(page.locator('#opponent')).toHaveText('УЧАСТКОВОГО');
  await expect(page.getByRole('button', { name: 'Следующий кадр' })).toBeDisabled();
  await page.getByRole('button', { name: 'Разобраться', exact: true }).click();
  await expect(page.locator('#fight-note')).toBeVisible();
  await page.locator('[data-cue="recognition"]').click();
  await page.getByRole('button', { name: 'Ссылка на этот момент' }).click();
  await expect(page).toHaveURL(/#scene=precinct&t=19\.0$/);
  await page.reload();
  await expect(page.locator('#scrub')).toHaveValue('19000');
  await page.getByRole('button', { name: 'Смотреть с этого момента', exact: true }).click();
  await expect(page.locator('#caption-typed')).toHaveText('Понятно.');
  await page.getByRole('button', { name: 'Сначала', exact: true }).click();
  await expect(page.locator('#caption-typed')).toContainText('Рабочий');
});

test('keyboard navigation and layout work without external runtime requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('http') && !request.url().startsWith('http://127.0.0.1:4197/')) external.push(request.url());
  });
  await page.goto('./#scene=precinct&t=0');
  await page.locator('#stage').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-cue=request]')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-cue=arrival]')).toHaveAttribute('aria-current', 'step');
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
  expect(external).toEqual([]);
  expect(await page.locator('#art').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test('image failure blocks playback with a visible explanation', async ({ page }) => {
  await page.route('**/art/precinct-idle.webp', (route) => route.abort());
  await page.goto('./#scene=precinct&t=0');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#play')).toBeDisabled();
});

test('muting active playback suspends audio; final frame stops and replay restarts', async ({ page }) => {
  await page.goto('./#scene=precinct&t=0');
  await page.getByRole('button', { name: 'Смотреть сцену', exact: true }).click();
  await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as AudioWindow).audioContexts[0].state)).toBe('suspended');
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Включить звук', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as AudioWindow).audioContexts[0].state)).toBe('running');
  await page.locator('[data-cue="fight"]').click();
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect(page.locator('#scrub')).toHaveValue('31100', { timeout: 6000 });
  await expect(page.getByRole('button', { name: 'Воспроизвести', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as AudioWindow).audioContexts[0].state)).toBe('suspended');
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect(page.locator('#caption-typed')).toContainText('Рабочий');
  expect(await page.evaluate(() => (window as unknown as AudioWindow).audioContexts.length)).toBe(1);
});

test('audio failure falls back to subtitle playback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('Audio unavailable'); } } });
  });
  await page.goto('./#scene=precinct&t=0');
  await page.getByRole('button', { name: 'Смотреть сцену', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Просмотр продолжится без звука');
  await expect.poll(async () => Number(await page.locator('#scrub').inputValue())).toBeGreaterThan(0);
});


test('all five panels preload, switch with cues, and a missing later panel blocks start', async ({ page }) => {
  await page.goto('./#scene=precinct&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#art')).toHaveAttribute('src', /worker-aftermath-v2.webp$/);
  await page.locator('[data-cue=request]').click();
  await expect(page.locator('#art')).toHaveAttribute('src', /precinct-idle.webp$/);
  await page.locator('[data-cue=report]').click();
  await expect(page.locator('#art')).toHaveAttribute('src', /art\/precinct.webp$/);
  await page.locator('[data-cue=thinking]').click();
  await expect(page.locator('#art')).toHaveAttribute('src', /boxer-thinking.webp$/);
  await page.locator('[data-cue=refusal]').click();
  await expect(page.locator('#art')).toHaveAttribute('src', /boxer-angry.webp$/);
  await page.route('**/art/boxer-thinking.webp', (route) => route.abort());
  await page.reload();
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
});

test('mid-phrase seek shows only elapsed text and playback continues at selected speed', async ({ page }) => {
  await page.goto('./#scene=precinct&t=6.5');
  await page.getByRole('button', { name: 'Смотреть с этого момента', exact: true }).click();
  await expect(page.locator('#caption-typed')).toContainText('Мне');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const text = await page.locator('#caption-typed').textContent();
  expect(text!.length).toBeLessThan('Мне справку, что я не судимый.'.length);
  await page.getByLabel('Скорость').selectOption('2');
  const before = Number(await page.locator('#scrub').inputValue());
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('#scrub').inputValue())).toBeGreaterThan(before + 700);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.locator('#caption-typed')).not.toHaveText(text!);
});


test('officer names concrete legs; split reaction pauses before the angry face', async ({ page }) => {
  await page.goto('./#scene=precinct&t=16');
  await page.getByRole('button', { name: 'Смотреть с этого момента', exact: true }).click();
  await expect(page.locator('#caption-typed')).toHaveText('Ноги в бетоне?');
  await expect(page.locator('[data-cue=shoes]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#subtitle')).toBeHidden();
  await page.locator('[data-cue=thinking]').click();
  await expect(page.locator('#art')).toHaveAttribute('src', /boxer-thinking.webp$/);
  await expect(page.locator('#subtitle')).toBeVisible();
  await expect(page.locator('#caption-typed')).toHaveText('');
  const camera = await page.locator('#art').evaluate((image) => ({
    transform: image.style.transform, origin: image.style.transformOrigin, opacity: getComputedStyle(image).opacity,
  }));
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect(page.locator('#caption-typed')).toHaveText('Сидеть?!?');
  await expect(page.locator('#art')).toHaveAttribute('src', /boxer-thinking.webp$/);
  await expect(page.locator('#art')).toHaveAttribute('src', /boxer-angry.webp$/);
  expect(await page.locator('#art').evaluate((image) => ({
    transform: image.style.transform, origin: image.style.transformOrigin, opacity: getComputedStyle(image).opacity,
  }))).toEqual(camera);
  await expect(page.locator('#caption-typed')).toHaveText('Ещё раз я не собираюсь!');
});


test('officer reports the beaten worker before asking about concrete on the suspect', async ({ page }) => {
  await page.goto('./#scene=precinct&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#scrub').fill('12000');
  await expect(page.locator('#caption-typed')).toHaveText('');
  await expect(page.locator('[data-cue=report]')).toHaveText(/Рабочего избили/);
  await page.locator('#scrub').fill('14755');
  await expect(page.locator('#caption-typed')).toHaveText('Рабочего избили? Приметы?');
  await expect(page.locator('#art')).toHaveAttribute('src', /precinct.webp$/);
  await page.locator('#scrub').fill('15999');
  await expect(page.locator('#caption-typed')).toHaveText('Рабочего избили? Приметы?');
  await expect(page.locator('[data-cue=report]')).toHaveAttribute('aria-current', 'step');
  await page.locator('#scrub').fill('16000');
  await expect(page.locator('#caption-typed')).toHaveText('');
  await expect(page.locator('[data-cue=clue]')).toHaveAttribute('aria-current', 'step');
  await page.locator('#scrub').fill('17799');
  await expect(page.locator('#caption-typed')).toHaveText('Ноги в бетоне?');
});
