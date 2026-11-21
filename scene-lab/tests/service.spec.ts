import { expect, test } from '@playwright/test';

test('service scene starts paused, freezes the disclosure and subtitles, finishes at 2x and replays', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') });
  await page.goto('./#scene=service&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#title')).toHaveText('Покажи, что умеешь');
  await expect(page.locator('#art')).toHaveAttribute('src', /service-aftermath-v1.webp$/);
  await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'));
  await page.clock.runFor(500);
  await expect(page.locator('#scrub')).toHaveValue('0');
  await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
  await page.locator('#start').click();
  await page.clock.runFor(1200);
  const partial = await page.locator('#caption-typed').textContent();
  expect(partial!.length).toBeGreaterThan(0);
  expect(partial!.length).toBeLessThan('Ты снял, что он первый начал?'.length);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const paused = await page.locator('#scrub').inputValue(), camera = await page.locator('#art').getAttribute('style');
  await page.clock.runFor(500);
  await expect(page.locator('#scrub')).toHaveValue(paused);
  await expect(page.locator('#art')).toHaveAttribute('style', camera!);
  await expect(page.locator('#caption-typed')).toHaveText(partial!);
  await page.locator('#speed').selectOption('2');
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await page.clock.runFor(18000);
  await expect(page.locator('#scrub')).toHaveValue('34250');
  await expect(page.locator('#fight')).toBeVisible();
  await expect(page.locator('#opponent')).toHaveText('СТРИПТИЗЁРШИ');
  await expect(page.locator('#art')).toHaveAttribute('src', /service-final-v1.webp$/);
  await expect(page.locator('#scene-flash')).toBeHidden();
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await page.clock.runFor(100);
  await expect(page.locator('#fight')).toBeHidden();
  await expect(page.locator('#art')).toHaveAttribute('src', /service-aftermath-v1.webp$/);
});

test('building, sign reading, reaction and final title keep their staging at exact seek boundaries', async ({ page }) => {
  await page.goto('./#scene=service&t=0');
  await expect(page.locator('#start')).toBeEnabled();
  for (const [time, image, text] of [
    ['3999', 'aftermath', 'Ты снял, что он первый начал?'], ['4000', 'building', ''],
    ['7499', 'building', 'Я добрался до нужного здания.'], ['7500', 'door', ''],
    ['8099', 'door', ''], ['11999', 'door', 'И решил сразу обратиться к сотрудникам.'],
    ['12000', 'wide', ''], ['15199', 'wide', 'Мальчик, мы закрыты.'],
    ['17799', 'wide', 'Мне справку взять.'], ['19999', 'wide', 'Танцевать пришёл?'],
    ['20000', 'wide', ''], ['20649', 'wide', ''], ['20650', 'invite', ''],
    ['23349', 'invite', 'Покажи, что умеешь.'], ['27149', 'invite', 'У меня не было времени на танцы.'],
    ['27150', 'angry', ''], ['27649', 'angry', ''],
    ['31749', 'angry', 'Я был вынужден показать то, что умею.'],
  ]) {
    await page.locator('#scrub').fill(time);
    await expect(page.locator('#art')).toHaveAttribute('src', new RegExp(`service-${image}-v${image === 'door' ? 2 : 1}.webp$`));
    await expect(page.locator('#caption-typed')).toHaveText(text);
    await expect(page.locator('#fight')).toBeHidden();
  }
  await page.locator('#scrub').fill('31750');
  await expect(page.locator('#art')).toHaveAttribute('src', /service-final-v1.webp$/);
  await expect(page.locator('#fight')).toBeVisible();
  await expect(page.locator('#scene-flash')).toBeHidden();
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('queue');
  await expect(page.locator('#chapter')).toHaveText('Глава 06 · Бабка');
  await expect(page.locator('#scrub')).toHaveValue('0');
});

test('a failed invitation panel blocks start; switching away and retrying restores the scene', async ({ page }) => {
  await page.route('**/art/service-invite-v1.webp', (route) => route.abort());
  await page.goto('./#scene=service&t=0');
  await expect(page.locator('#status')).toContainText('Не удалось загрузить иллюстрацию');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#play')).toBeDisabled();
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('slider');
  await expect(page.locator('#start')).toBeEnabled();
  await page.unroute('**/art/service-invite-v1.webp');
  await page.getByLabel('СЦЕНА', { exact: true }).selectOption('service');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#scrub')).toHaveValue('0');
});

test('reduced-motion disclosure, scene links and long mobile subtitles/title remain readable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#scene=service&t=1.2');
  await expect(page.locator('#start')).toBeEnabled();
  const close = await page.locator('#art').getAttribute('style');
  await page.locator('#scrub').fill('1999');
  await expect(page.locator('#art')).toHaveAttribute('style', close!);
  await page.locator('#scrub').fill('2000');
  expect(await page.locator('#art').getAttribute('style')).not.toBe(close);
  await page.getByRole('button', { name: 'Ссылка на этот момент' }).click();
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#scene-select')).toHaveValue('service');
  await expect(page.locator('#scrub')).toHaveValue('2000');
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('#scrub').fill('31749');
    await expect(page.locator('#caption-typed')).toHaveText('Я был вынужден показать то, что умею.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const stage = await page.locator('#stage').boundingBox(), subtitle = await page.locator('#subtitle').boundingBox();
    expect(subtitle!.x).toBeGreaterThanOrEqual(stage!.x);
    expect(subtitle!.x + subtitle!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
    await page.locator('#scrub').fill('31750');
    await expect(page.locator('#fight')).toBeVisible();
    await expect(page.locator('#scene-flash')).toBeHidden();
    const title = await page.locator('#opponent').boundingBox();
    expect(title!.x).toBeGreaterThanOrEqual(stage!.x);
    expect(title!.x + title!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  }
});
