import { expect, test, type Page, type Route } from '@playwright/test';

async function expectUsablePlayer(page: Page): Promise<void> {
  const stage = await page.locator('#stage').boundingBox();
  expect(stage!.width / stage!.height).toBeCloseTo(4 / 3, 2);
  const viewport = page.viewportSize()!;
  for (const id of ['play', 'mute', 'fullscreen', 'scrub']) {
    const target = page.locator(`#${id}`);
    const box = await target.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(stage!.y + stage!.height);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(box!.height).toBeGreaterThanOrEqual(id === 'scrub' ? 24 : 44);
    expect(await target.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
  }
}

async function expectReadableCaption(page: Page, text = 'Мне справку, что я не судимый.'): Promise<void> {
  await expect(page.locator('#subtitle')).toBeVisible();
  await expect(page.locator('#caption-typed')).toHaveText(text);
  const stage = await page.locator('#stage').boundingBox();
  const caption = await page.locator('#subtitle').boundingBox();
  expect(caption!.y).toBeGreaterThanOrEqual(stage!.y);
  expect(caption!.y + caption!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
  expect(caption!.x).toBeGreaterThanOrEqual(stage!.x);
  expect(caption!.x + caption!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
}

for (const path of ['./film.html', './#scene=precinct&t=0']) {
  test(`native fullscreen keeps the shared controls reachable through rotation and exit: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path);
    await expect(page.locator('#start')).toBeEnabled();
    await page.locator('#scrub').fill(path.includes('film') ? '125000' : '9000');
    await expectReadableCaption(page);
    const framing = await page.locator('#art').getAttribute('style');
    await page.locator('#fullscreen').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
    await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'true');
    for (const viewport of [{ width: 360, height: 800 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await expectUsablePlayer(page);
      await expectReadableCaption(page);
      await expect(page.locator('#art')).toHaveAttribute('style', framing!);
    }
    await page.locator('#scrub').fill(path.includes('film') ? '131474' : '15500');
    await expectReadableCaption(page, 'Рабочего избили? Приметы?');
    await expect(page.locator('#art')).toHaveCSS('transform', 'matrix(1.6, 0, 0, 1.6, 0, 0)');
    expect(await page.locator('#art').evaluate(art => (art as HTMLElement).style.transformOrigin)).toBe('85% 35%');
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
    await page.locator('#mute').click();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#scrub').fill('11000');
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#player')).not.toHaveClass(/is-expanded/);
    await expect(page.locator('#scrub')).toHaveValue('11000');
    await page.locator('#fullscreen').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
    await page.evaluate(() => {
      const exit = document.exitFullscreen.bind(document);
      document.exitFullscreen = () => {
        document.exitFullscreen = exit;
        return Promise.reject(new Error('Exit failed'));
      };
    });
    await page.getByRole('button', { name: 'Свернуть просмотр', exact: true }).click();
    await expect(page.locator('#status')).toContainText('Не удалось выйти');
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Свернуть просмотр', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect(page.locator('body')).not.toHaveClass(/player-expanded/);
  });
}

test('repeated taps during a pending fullscreen request do not duplicate requests or close the player', async ({ page }) => {
  await page.addInitScript(() => {
    const browser = window as unknown as Window & { fullscreenRequests: number; finishFullscreen: () => void };
    browser.fullscreenRequests = 0;
    Element.prototype.requestFullscreen = () => {
      browser.fullscreenRequests++;
      return new Promise<void>(resolve => { browser.finishFullscreen = resolve; });
    };
  });
  await page.goto('./film.html');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#fullscreen').click();
  await page.locator('#fullscreen').click();
  await expect(page.locator('#player')).toHaveClass(/is-expanded/);
  expect(await page.evaluate(() => (window as unknown as Window & { fullscreenRequests: number }).fullscreenRequests)).toBe(1);
  await page.evaluate(() => (window as unknown as Window & { finishFullscreen: () => void }).finishFullscreen());
  await page.locator('#fullscreen').click();
  await expect(page.locator('#player')).not.toHaveClass(/is-expanded/);
});

for (const api of ['missing', 'rejected'] as const) {
  test(`${api} fullscreen API offers a usable viewport player with button and Escape exits`, async ({ page }) => {
    await page.addInitScript(api => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: api === 'missing' ? undefined : () => Promise.reject(new Error('Unavailable')),
      });
    }, api);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('./film.html');
    await expect(page.locator('#start')).toBeEnabled();
    await page.locator('#fullscreen').click();
    await expect(page.locator('#player')).toHaveClass(/is-expanded/);
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expectUsablePlayer(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await expectUsablePlayer(page);
    await page.locator('#start').click();
    await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
    await page.getByRole('button', { name: 'Свернуть просмотр', exact: true }).click();
    await expect(page.locator('#player')).not.toHaveClass(/is-expanded/);
    await page.locator('#fullscreen').click();
    await expect(page.locator('#player')).toHaveClass(/is-expanded/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#player')).not.toHaveClass(/is-expanded/);
    await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#fullscreen')).toBeFocused();
  });
}

for (const api of ['native', 'missing', 'rejected'] as const) {
  test(`image failure remains visible after expansion and seeking: ${api}`, async ({ page }) => {
    if (api === 'missing') await page.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    });
    if (api === 'rejected') await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('Denied'));
    });
    let pending: Route | undefined;
    await page.route('**/art/epilogue-exit-v2.webp', route => { pending = route; });
    await page.goto('./#scene=film&t=0', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => !!pending).toBe(true);
    if (api === 'rejected') {
      await pending!.abort();
      await expect(page.locator('#status')).toContainText('Обновите страницу');
    }
    await page.locator('#fullscreen').click();
    await expect(page.locator('#player')).toHaveClass(/is-expanded/);
    if (api !== 'rejected') await pending!.abort();
    await expect(page.locator('#status')).toContainText('Обновите страницу');
    await expect(page.locator('#status')).toBeVisible();
    await page.locator('#scrub').fill('125000');
    await expect(page.locator('#start-overlay')).toBeHidden();
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#play')).toBeDisabled();
    await page.locator('#fullscreen').click();
    await page.unroute('**/art/epilogue-exit-v2.webp');
    await page.locator('#share').click();
    await page.locator('#mode-select').selectOption('scene');
    await expect(page.locator('#start')).toBeEnabled();
    await page.locator('#fullscreen').click();
    await expect(page.locator('#status')).toBeHidden();
  });
}

test('audio failure is explained inside fullscreen while subtitle playback continues', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('Unavailable'); } } });
  });
  await page.goto('./film.html#scene=film&t=125');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#fullscreen').click();
  await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('Звук недоступен');
  await expect(page.locator('#status')).toBeVisible();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
  await expect(page.locator('#subtitle')).toBeVisible();
});
