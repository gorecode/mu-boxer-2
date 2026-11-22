import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {schedules, poseAt} from './schedule.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(root, '../../../..');
const jabStage = JSON.parse(await fs.readFile(path.join(root, '../jab-reference-animation/metadata.json'), 'utf8')).stage;
const {chromium} = createRequire(path.join(project, 'scene-lab/package.json'))('playwright');
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
try {
  for (const [name, schedule] of Object.entries(schedules)) {
    const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
    await page.clock.install({time: new Date('2026-11-22T09:00:00Z')});
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:4197/mu-boxer/fight.html');
    await page.waitForFunction(() => document.querySelector('#start').textContent === 'НАЧАТЬ БОЙ →');
    await page.clock.pauseAt(new Date('2026-11-22T10:00:00Z'));
    await page.addScriptTag({content: `window.poseAt = ${poseAt.toString()}`});
    await page.evaluate(async ({schedule, jabStage}) => {
      const manifest = await fetch('./art/fight/manifest.json').then(r => r.json());
      const images = {};
      for (const [, actor, i] of schedule) {
        const image = new Image();
        image.src = `./art/fight/${actor === 'jab' ? 'jab/jab-' : 'boxer-'}${i}.webp`;
        await image.decode(); images[`${actor}-${i}`] = image;
      }
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      window.drawn = [];
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        const image = args[0];
        if (image instanceof HTMLImageElement && /(?:boxer-|jab-hybrid\/jab-)\d+\.webp$/.test(image.src) && document.querySelector('#arena').dataset.playerAction === 'jab') {
          const t = Number(document.querySelector('#arena').dataset.playerActionTime) * 1000;
          const [, actor, i] = window.poseAt(schedule, t);
          window.drawn.push({time: t, actor, frame: i});
          {
            const frame = actor === 'jab' ? jabStage : manifest.boxer[i];
            const sourceActor = image.src.includes('/boxer-') ? 'boxer' : 'jab';
            const source = manifest[sourceActor][Number(image.src.match(/(?:boxer-|jab-)(\d+)/)[1])];
            this.save(); this.scale(frame.scale / source.scale, frame.scale / source.scale);
            draw.call(this, images[`${actor}-${i}`], -frame.anchorX, -frame.anchorY, frame.width, frame.height);
            this.restore(); return;
          }
        }
        return Reflect.apply(draw, this, args);
      };
    }, {schedule, jabStage});
    await page.locator('#training-mode').check(); await page.locator('#start').click(); await page.clock.runFor(1800);
    await page.locator('#arena').focus();
    const out = path.join(root, '.capture', name); await fs.mkdir(out, {recursive: true});
    for (let i = 0; i < 61; i++) {
      if (i === 10) await page.keyboard.press('j');
      const png = await page.evaluate(() => {
        const source = document.querySelector('#arena'), canvas = document.createElement('canvas');
        canvas.width = 650; canvas.height = 665;
        canvas.getContext('2d').drawImage(source, 170, 175, 650, 665, 0, 0, 650, 665);
        return canvas.toDataURL().split(',')[1];
      });
      await fs.writeFile(path.join(out, `${String(i).padStart(3, '0')}.png`), Buffer.from(png, 'base64'));
      await page.clock.runFor(20);
    }
    const drawn = await page.evaluate(() => window.drawn);
    assert.ok(drawn.length > 0);
    if (name === 'hybrid') {
      assert.ok(drawn.some(f => f.actor === 'boxer' && f.frame === 2 && f.time >= 80 && f.time < 160));
      assert.deepEqual([...new Set(drawn.filter(f => f.actor === 'jab').map(f => f.frame))], [2, 12]);
    }
    await fs.writeFile(path.join(out, 'drawn.json'), JSON.stringify(drawn, null, 2) + '\n');
    console.log(`${name}: ${drawn.length} actual draw calls`);
    await page.close();
  }
} finally {await browser.close();}
