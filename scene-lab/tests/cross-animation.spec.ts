import { expect, test, type Page } from '@playwright/test';

type Draw = { source: string; frame: number; time: number; x: number; y: number; a: number; d: number; dx: number; dy: number };
type Recorded = Window & { crossDraws?: Draw[] };
const samples = (page: Page) => page.evaluate(() => (window as Recorded).crossDraws!);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const frames: Draw[] = []; (window as Recorded).crossDraws = frames;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(CanvasRenderingContext2D.prototype.drawImage, {
      apply(draw, context: CanvasRenderingContext2D, args) {
        const image = args[0], arena = document.querySelector<HTMLCanvasElement>('#arena');
        const match = image instanceof HTMLImageElement ? image.src.match(/\/(boxer-(\d+)|cross-hybrid\/cross-(\d+))\.webp$/) : null;
        if (match && arena?.dataset.playerAction === 'cross') {
          const t = context.getTransform();
          frames.push({ source: match[3] !== undefined ? 'cross' : 'boxer', frame: Number(match[2] ?? match[3]),
            time: Number(arena.dataset.playerActionTime), x: t.e, y: t.f, a: t.a, d: t.d, dx: args[1], dy: args[2] });
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
  await page.locator('#arena').focus();
}
async function cross(page: Page) {
  await page.keyboard.press('j'); await page.clock.runFor(450); await page.keyboard.press('j');
}

test('second J plays exactly the approved one-drawing hybrid and stays recovering after the visual return', async ({ page }, info) => {
  await start(page); await cross(page);
  for (const [name,ms] of [['outgoing',120],['contact',70],['return',50],['idle',40]] as const) {
    await page.clock.runFor(ms);
    await page.locator('.arena-shell').screenshot({path:info.outputPath(`cross-${name}.png`)});
  }
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action','cross');
  await page.clock.runFor(200);
  const frames = await samples(page);
  const sequence = frames.map(f=>`${f.source}-${f.frame}`).filter((f,i,a)=>i===0||f!==a[i-1]);
  expect(sequence).toEqual(['boxer-0','cross-0','boxer-3','cross-0','boxer-0']);
  const outgoing = frames.filter(f=>f.source==='cross'&&f.time<.14), returning = frames.filter(f=>f.source==='cross'&&f.time>=.23);
  expect(outgoing.length).toBeGreaterThan(0); expect(returning.length).toBeGreaterThan(0);
  for (const f of outgoing) { expect(f.time).toBeGreaterThanOrEqual(.1); expect(f.time).toBeLessThan(.14); }
  for (const f of returning) { expect(f.time).toBeGreaterThanOrEqual(.23); expect(f.time).toBeLessThan(.25); }
  for (const f of [...outgoing,...returning]) {
    expect(f.dx).toBe(-228); expect(f.dy).toBe(-495); expect(f.a).toBeCloseTo(1.19);expect(f.d).toBeCloseTo(1.19);
    expect(f.x).toBe(430);expect(f.y).toBe(820);
  }
  await expect(page.locator('#arena')).toHaveAttribute('data-player-action','');
  await expect(page.locator('#worker-hp')).toHaveText('120 / 120');
});

test('pause freezes the intermediate frame and the same asset mirrors on the other side', async ({ page }, info) => {
  await start(page);await cross(page);await page.clock.runFor(120);
  const before=(await samples(page)).at(-1)!;expect(before.source).toBe('cross');
  await page.keyboard.press('Escape');const canvas=await page.locator('#arena').evaluate((c:HTMLCanvasElement)=>c.toDataURL());
  await page.clock.runFor(500);expect(await page.locator('#arena').evaluate((c:HTMLCanvasElement)=>c.toDataURL())).toBe(canvas);
  await page.keyboard.press('Escape');await page.clock.runFor(500);
  await page.locator('#edit-attack').selectOption('poke');await page.locator('#edit-phase').selectOption('3');
  await page.locator('#training-freeze').click();await page.locator('#arena').focus();
  await page.keyboard.down('d');await page.clock.runFor(500);await page.keyboard.press('Space');await page.clock.runFor(1200);await page.keyboard.up('d');
  await page.clock.runFor(50);await page.keyboard.press('j');await page.clock.runFor(450);await page.keyboard.press('j');await page.clock.runFor(120);
  const mirrored=(await samples(page)).at(-1)!;expect(mirrored.source).toBe('cross');
  expect(mirrored.a).toBeCloseTo(-1.19);expect(mirrored.d).toBeCloseTo(1.19);
  expect(mirrored.dx).toBe(-228);expect(mirrored.dy).toBe(-495);expect(mirrored.y).toBe(820);
  await page.locator('#hitboxes').check();await page.locator('.arena-shell').screenshot({path:info.outputPath('cross-mirrored-boxes.png')});
});

test('missing cross artwork blocks start and retry recovers', async ({ page }) => {
  await page.route('**/art/fight/cross-hybrid/cross-0.webp',route=>route.abort());await page.goto('./fight.html');
  await expect(page.locator('#load-status')).toHaveText('Не загрузился рисунок: cross-0.webp');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase','menu');
  await page.unroute('**/art/fight/cross-hybrid/cross-0.webp');await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('НАЧАТЬ БОЙ →');
});

test('a missing or invalid cross registration fails before the fight starts', async ({ page }) => {
  for (const patch of ['missing','invalid']) {
    await page.route('**/art/fight/manifest.json',async route=>{
      const response=await route.fetch(),manifest=await response.json();
      if(patch==='missing')delete manifest.cross;else manifest.cross[0].scale=0;
      await route.fulfill({response,json:manifest});
    });
    await page.goto('./fight.html');await expect(page.locator('#load-status')).toHaveText('Повреждён список поз бойцов.');
    await expect(page.locator('#arena')).toHaveAttribute('data-phase','menu');
    await page.unroute('**/art/fight/manifest.json');
  }
});
