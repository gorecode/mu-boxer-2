import { expect, test, type Page } from '@playwright/test';

type Draw = { source: string; frame: number; action: string; x: number; y: number; a: number; d: number; dx: number; dy: number };
type Recorded = Window & { walkDraws?: Draw[] };
const samples = (page: Page) => page.evaluate(() => (window as Recorded).walkDraws!);
const latest = async (page: Page) => (await samples(page)).at(-1)!;
const clear = (page: Page) => page.evaluate(() => { (window as Recorded).walkDraws!.length = 0; });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const draws: Draw[] = []; (window as Recorded).walkDraws = draws;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(original, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const image = args[0];
        const match = image instanceof HTMLImageElement ? image.src.match(/\/(boxer-(\d+)|walk\/walk-(\d+)|jab-hybrid\/jab-(\d+))\.webp$/) : null;
        if (match) {
          const t = context.getTransform();
          draws.push({ source: match[3] !== undefined ? 'walk' : match[4] !== undefined ? 'jab' : 'boxer',
            frame: Number(match[2] ?? match[3] ?? match[4]), action: document.querySelector<HTMLCanvasElement>('#arena')?.dataset.playerAction ?? '',
            x: t.e, y: t.f, a: t.a, d: t.d, dx: args[1], dy: args[2] });
        }
        return Reflect.apply(draw, context, args);
      },
    });
  });
  await page.clock.install({ time: new Date('2026-11-23T09:00:00Z') });
});

async function start(page: Page) {
  await page.goto('./fight.html'); await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
  await page.clock.pauseAt(new Date('2026-11-23T10:00:00Z'));
  await page.locator('#training-mode').check(); await page.locator('#start').click(); await page.clock.runFor(1800);
  await page.locator('#arena').focus(); await clear(page);
}

test('four selected sprites play forward and backward at game speed, then stop mid-stride in the original stance', async ({ page }, info) => {
  await start(page);
  await page.locator('#hitboxes').check(); await page.locator('#arena').focus();
  await page.keyboard.down('d'); await page.clock.runFor(220);
  expect((await latest(page)).source).toBe('walk'); expect((await latest(page)).frame).toBe(2);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('walk-forward.png') });
  await page.clock.runFor(280); await page.keyboard.up('d');
  const forward = (await samples(page)).filter(f => f.source === 'walk');
  const sequence = forward.map(f => f.frame).filter((f, i, all) => i === 0 || f !== all[i - 1]);
  expect(sequence).toEqual([0, 1, 2, 3, 0, 1]);
  for (const f of forward) {
    expect(f.a).toBeCloseTo(1.19); expect(f.d).toBeCloseTo(1.19); expect(f.y).toBe(820);
    expect(f.dx).toBe(-228); expect(f.dy).toBe(-495);
  }
  expect(Math.abs(Number(await page.locator('#arena').getAttribute('data-player-x')) - 607.5)).toBeLessThan(6);
  await page.clock.runFor(50); expect(await latest(page)).toMatchObject({ source: 'boxer', frame: 0 });
  await clear(page); await page.keyboard.down('a'); await page.clock.runFor(220);
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('walk-backward.png') });
  await page.clock.runFor(280); await page.keyboard.up('a');
  const backward = (await samples(page)).filter(f => f.source === 'walk').map(f => f.frame);
  expect(backward.filter((f, i, all) => i === 0 || f !== all[i - 1])).toEqual([3, 2, 1, 0, 3, 2]);
  await page.clock.runFor(50); expect(await latest(page)).toMatchObject({ source: 'boxer', frame: 0 });
  expect(Math.abs(Number(await page.locator('#arena').getAttribute('data-player-x')) - 430)).toBeLessThan(6);
});

test('training snapshot, freeze and pause retain the selected walking drawing', async ({ page }) => {
  await start(page); await page.keyboard.down('d'); await page.clock.runFor(125);
  const selected = await latest(page); expect(selected).toMatchObject({ source: 'walk', frame: 1 });
  await page.locator('#training-save').click(); await page.keyboard.up('d'); await page.clock.runFor(60);
  expect(await latest(page)).toMatchObject({ source: 'boxer', frame: 0 });
  await page.locator('#training-load').click(); expect(await latest(page)).toMatchObject({ source: 'walk', frame: selected.frame, x: selected.x });
  const frozen = await page.locator('#arena').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.clock.runFor(400); expect(await page.locator('#arena').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(frozen);
  await page.locator('#arena').focus(); await page.keyboard.press('Escape');
  expect(await latest(page)).toMatchObject({ source: 'walk', frame: selected.frame });
  const paused = await page.locator('#arena').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.clock.runFor(400); expect(await page.locator('#arena').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(paused);
  await page.keyboard.press('Escape'); await page.locator('#training-freeze').click(); await page.clock.runFor(50);
  expect(await latest(page)).toMatchObject({ source: 'boxer', frame: 0 });
});

test('walking yields immediately to jab, guard, crouch, dodge and an incoming hit', async ({ page }) => {
  await start(page); await page.keyboard.down('d'); await page.clock.runFor(125);
  await clear(page); await page.keyboard.press('j'); await page.clock.runFor(60);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action', 'jab');
  expect((await samples(page)).filter(f => f.action === 'jab').every(f => f.source !== 'walk')).toBe(true);
  await page.clock.runFor(400); expect((await latest(page)).source).toBe('walk');
  await page.keyboard.down('l'); await page.clock.runFor(50);
  expect(await latest(page)).toMatchObject({ source: 'boxer', frame: 4 });
  await page.keyboard.up('l'); await page.keyboard.down('s'); await page.clock.runFor(50);
  expect(await latest(page)).toMatchObject({ source: 'boxer', frame: 5 });
  await page.keyboard.up('s'); await page.keyboard.press('u'); await page.clock.runFor(50);
  expect(await latest(page)).toMatchObject({ source: 'boxer', frame: 1 });
  await page.keyboard.up('d');
  await page.locator('#edit-attack').selectOption('poke'); await page.locator('#edit-phase').selectOption('1');
  await page.locator('#training-freeze').click(); await page.locator('#arena').focus();
  await page.keyboard.down('d'); await page.clock.runFor(30); await page.keyboard.up('d');
  await expect(page.locator('#arena')).toHaveAttribute('data-player-reaction', 'light');
  expect(await latest(page)).toMatchObject({ source: 'boxer', frame: 6 });
  expect(Number((await page.locator('#player-hp').textContent())!.split('/')[0])).toBeLessThan(100);
});

test('holding movement at the arena wall does not keep playing the walk', async ({ page }) => {
  await start(page); await page.keyboard.down('a'); await page.clock.runFor(1000);
  await expect(page.locator('#arena')).toHaveAttribute('data-player-x', '215.0');
  await clear(page); await page.clock.runFor(300);
  const held = await samples(page); expect(held.length).toBeGreaterThan(0);
  expect(held.every(f => f.source === 'boxer' && f.frame === 0)).toBe(true);
  await page.keyboard.up('a'); await page.keyboard.down('d'); await page.clock.runFor(125);
  expect(await latest(page)).toMatchObject({ source: 'walk', frame: 1 });
});

test('the same walk sprites and anchor mirror after crossing the opponent', async ({ page }, info) => {
  await start(page);
  await page.locator('#edit-attack').selectOption('poke'); await page.locator('#edit-phase').selectOption('3');
  await page.locator('#training-freeze').click(); await page.locator('#arena').focus();
  await page.keyboard.down('d'); await page.clock.runFor(500); await page.keyboard.press('Space'); await page.clock.runFor(1200);
  await clear(page); await page.clock.runFor(400); await page.keyboard.up('d');
  const mirrored = (await samples(page)).filter(f => f.source === 'walk');
  expect([...new Set(mirrored.map(f => f.frame))].sort()).toEqual([0, 1, 2, 3]);
  for (const f of mirrored) { expect(f.a).toBeCloseTo(-1.19); expect(f.d).toBeCloseTo(1.19); expect(f.dx).toBe(-228); expect(f.dy).toBe(-495); }
  await page.locator('.arena-shell').screenshot({ path: info.outputPath('walk-mirrored.png') });
});

test('a missing walking texture blocks start and retry recovers without reloading', async ({ page }) => {
  await page.route('**/art/fight/walk/walk-2.webp', route => route.abort());
  await page.goto('./fight.html'); await expect(page.locator('#load-status')).toHaveText('Не загрузился рисунок: walk-2.webp');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'menu');
  await page.unroute('**/art/fight/walk/walk-2.webp'); await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});

test('an incomplete walking manifest fails before the fight starts', async ({ page }) => {
  await page.route('**/art/fight/manifest.json', async route => {
    const response = await route.fetch(), manifest = await response.json(); manifest.walk.pop();
    await route.fulfill({ response, json: manifest });
  });
  await page.goto('./fight.html'); await expect(page.locator('#load-status')).toHaveText('Повреждён список поз бойцов.');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'menu');
});
