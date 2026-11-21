import { expect, test } from '@playwright/test';

for (const view of ['scene', 'film', 'layers']) {
  test(`StrictMode cleanup releases browser listeners and active audio before remount: ${view}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    await page.addInitScript(() => {
      const tracked = new Map<string, Set<EventListenerOrEventListenerObject>>();
      const watched = new Set(['hashchange', 'keydown', 'pagehide', 'visibilitychange', 'fullscreenchange']);
      const add = EventTarget.prototype.addEventListener;
      const remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if ((this === window || this === document) && watched.has(type) && listener) {
          const key = `${this === window ? 'window' : 'document'}:${type}`;
          if (!tracked.has(key)) tracked.set(key, new Set());
          tracked.get(key)!.add(listener);
        }
        return add.call(this, type, listener, options);
      };
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        if ((this === window || this === document) && listener) tracked.get(`${this === window ? 'window' : 'document'}:${type}`)?.delete(listener);
        return remove.call(this, type, listener, options);
      };
      const contexts: AudioContext[] = [];
      const Native = window.AudioContext;
      window.AudioContext = class extends Native { constructor() { super(); contexts.push(this); } };
      Object.assign(window, {
        lifecycleProbe: () => ({ listeners: [...tracked].map(([key, listeners]) => [key, listeners.size]), audio: contexts.map(context => context.state) }),
      });
    });
    await page.goto(`http://127.0.0.1:4198/mu-boxer/tests/fixtures/lifecycle.html?view=${view}#scene=precinct&t=0`);
    const play = page.locator('#play');
    await expect(play).toBeEnabled();
    if (view === 'layers') await play.click();
    else await page.locator('#start').click();
    await expect(play).toHaveText(view === 'layers' ? 'Пауза' : 'Ⅱ');
    const probe = () => page.evaluate(() => (window as unknown as { lifecycleProbe(): { listeners: [string, number][]; audio: string[] } }).lifecycleProbe());
    const animationCount = () => page.evaluate(() => (window as unknown as { animationCount(): number }).animationCount());
    const mounted = await probe();
    const tracks = await animationCount();
    expect(tracks).toBeGreaterThan(0);
    expect(mounted.listeners.length).toBeGreaterThan(0);
    for (const [, count] of mounted.listeners) expect(count).toBe(1);
    if (view !== 'layers') expect(mounted.audio).toEqual(['running']);
    await page.locator('#fixture-unmount').click();
    await expect(page.locator('#app')).toBeEmpty();
    await expect.poll(animationCount).toBe(0);
    await expect.poll(async () => (await probe()).listeners.every(([, count]) => count === 0)).toBe(true);
    if (view !== 'layers') await expect.poll(async () => (await probe()).audio).toEqual(['closed']);
    await page.locator('#fixture-mount').click();
    await expect(play).toBeEnabled();
    if (view === 'layers') await play.click();
    else await page.locator('#start').click();
    await expect(play).toHaveText(view === 'layers' ? 'Пауза' : 'Ⅱ');
    const remounted = await probe();
    expect(await animationCount()).toBe(tracks);
    for (const [, count] of remounted.listeners) expect(count).toBe(1);
    if (view !== 'layers') expect(remounted.audio).toEqual(['closed', 'running']);
    await page.locator('#fixture-unmount').click();
    expect(errors).toEqual([]);
  });
}
