import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('./', import.meta.url));
const project = resolve(root, '../../../..');
const art = resolve(project, 'scene-lab/public/art/fight');
const manifest = JSON.parse(await readFile(resolve(art, 'manifest.json'), 'utf8'));
const names = ['arena.webp', ...[0, 2, 3, 7, 12].map(i => `boxer-${i}.webp`),
  ...[0, 1, 2, 6].map(i => `worker-${i}.webp`),
  ...[0, 1, 2, 3].map(i => `walk/walk-${i}.webp`), 'jab-hybrid/jab-0.webp', 'cross-hybrid/cross-0.webp'];
const sources = await Promise.all(names.map(async name => {
  const bytes = await readFile(resolve(art, name));
  assert(bytes.length > 200, `Missing source: ${name}`);
  return { name, sha256: createHash('sha256').update(bytes).digest('hex'),
    url: `data:image/webp;base64,${bytes.toString('base64')}` };
}));
const { chromium } = createRequire(resolve(project, 'scene-lab/package.json'))('playwright');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ sources, manifest }) => {
    const images = {};
    for (const source of sources) {
      const image = new Image(); image.src = source.url; await image.decode(); images[source.name] = image;
    }
    const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const titles = ['ТАРАННЫЙ ПРЯМОЙ · V2', 'ОТСКОК → ДВОЙКА · V2'];
    const subtitles = ['Рука сразу вперёд → скольжение с отталкиванием', 'Короткий прыжок назад → боковой → прямой другой рукой'];
    const ids = ['dash-straight', 'pullback-hook'];
    const lerp = (a, b, t, start, end) => a + (b - a) * Math.max(0, Math.min(1, (t - start) / (end - start)));
    function state(index, t) {
      const startX = [400, 620][index];
      let x = startX, key = 'boxer-0.webp', worker = 'worker-0.webp', wx = 940;
      let phase = 'ИСХОДНАЯ СТОЙКА', impact = false, lift = 0, active = false, contact = 0, hand = null;
      if (index === 0) {
        if (t >= 600 && t < 640) { key = 'jab-hybrid/jab-0.webp'; phase = 'ВЫХОД РУКИ · 40 мс'; }
        if (t >= 640 && t < 1300) key = 'boxer-2.webp';
        if (t >= 640 && t < 1240) { active = true; hand = 'jab'; phase = 'СКОЛЬЖЕНИЕ · УДАР АКТИВЕН'; }
        x = lerp(400, 650, t, 640, 900);
        const push = lerp(0, 190, t, 900, 1240);
        if (t >= 900) { x = 650 + push; wx = 940 + push; worker = 'worker-6.webp'; phase = 'ПОПАДАНИЕ → НЕПРЕРЫВНЫЙ ТОЛЧОК'; }
        if (t >= 900 && t < 960) { worker = 'worker-0.webp'; impact = true; contact = 1; }
        if (t >= 1240) phase = 'ВОЗВРАТ В СТОЙКУ';
        if (t >= 1740) { worker = 'worker-0.webp'; phase = 'СТОЙКА'; }
      } else {
        if (t >= 560 && t < 740) { worker = 'worker-1.webp'; phase = 'ЛОПАТА: ЗАМАХ'; }
        if (t >= 640 && t < 800) {
          x = lerp(620, 430, t, 640, 800); lift = 55 * Math.sin(Math.PI * (t - 640) / 160);
          key = 'boxer-7.webp'; phase = 'ПРЫЖОК НАЗАД · 160 мс';
        }
        if (t >= 740 && t < 820) worker = 'worker-2.webp';
        if (t >= 800 && t < 960) {
          x = lerp(430, 780, t, 800, 960); key = `walk/walk-${Math.min(3, Math.floor((t - 800) / 40))}.webp`;
          phase = 'СРАЗУ В ОТВЕТ';
        }
        if (t >= 820 && t < 960) worker = 'worker-1.webp';
        if (t >= 960) x = 780;
        if (t >= 940 && t < 1060) { key = 'boxer-12.webp'; active = true; hand = 'left-hook'; phase = 'БОКОВОЙ В ГОЛОВУ'; }
        if (t >= 960 && t < 1040) { contact = 1; impact = true; worker = t < 1000 ? 'worker-0.webp' : 'worker-6.webp'; }
        if (t >= 1040) { worker = 'worker-6.webp'; wx = lerp(940, 960, t, 1040, 1120); }
        if (t >= 1060 && t < 1100) { key = 'cross-hybrid/cross-0.webp'; phase = 'СМЕНА РУКИ · 40 мс'; }
        if (t >= 1100 && t < 1300) { key = 'boxer-3.webp'; hand = 'right-straight'; phase = 'ПРЯМОЙ ДРУГОЙ РУКОЙ'; }
        if (t >= 1100 && t < 1240) active = true;
        if (t >= 1120 && t < 1240) { contact = 2; impact = true; }
        if (t >= 1240) { wx = lerp(960, 1040, t, 1240, 1510); phase = 'ВОЗВРАТ В СТОЙКУ'; }
        if (t >= 1740) { worker = 'worker-0.webp'; phase = 'СТОЙКА'; }
      }
      if (t >= 2000) { x = startX; wx = 940; key = 'boxer-0.webp'; worker = 'worker-0.webp'; phase = 'ПОВТОР'; }
      const opacity = t >= 1800 && t < 2000 ? lerp(1, 0, t, 1800, 1980)
        : t >= 2000 && t < 2200 ? lerp(0, 1, t, 2020, 2200) : 1;
      return { x, key, worker, wx, phase, impact, opacity, lift, active, contact, hand };
    }
    function metadata(key) {
      if (key.startsWith('walk/')) return manifest.walk[Number(key.match(/(\d+)\.webp$/)[1])];
      if (key.startsWith('jab-hybrid/')) return manifest.jab[0];
      if (key.startsWith('cross-hybrid/')) return manifest.cross[0];
      const [kind, number] = key.replace('.webp', '').split('-'); return manifest[kind][Number(number)];
    }
    function drawSprite(c, key, x, alpha = 1, lift = 0) {
      const m = metadata(key);
      c.save(); c.globalAlpha = alpha; c.translate(x, 820 - lift); c.scale(m.scale, m.scale);
      c.drawImage(images[key], -m.anchorX, -m.anchorY, m.width, m.height); c.restore();
    }
    const frames = {}, timeline = {};
    for (let index = 0; index < ids.length; index++) {
      frames[ids[index]] = []; timeline[ids[index]] = [];
      for (let t = 0; t < 2600; t += 20) {
        const s = state(index, t), world = make(1600, 900), w = world.getContext('2d');
        w.drawImage(images['arena.webp'], 0, 0, 1600, 900);
        w.fillStyle = '#120e1680'; w.fillRect(0, 0, 1600, 900);
        w.fillStyle = '#09060b80';
        for (const x of [s.x, s.wx]) { w.beginPath(); w.ellipse(x, 816, 120, 14, 0, 0, Math.PI * 2); w.fill(); }
        if (index === 0 && s.active) drawSprite(w, 'boxer-2.webp', s.x - 85, .15);
        drawSprite(w, s.worker, s.wx); drawSprite(w, s.key, s.x, 1, s.lift);
        if (s.impact) {
          const px = s.x + (index === 0 ? 254.66 : s.contact === 1 ? 139.23 : 227.29);
          const py = index === 0 ? 358 : s.contact === 1 ? 354 : 391;
          w.strokeStyle = '#ffe3b0'; w.lineWidth = 4;
          for (let j = 0; j < 7; j++) {
            const a = j * Math.PI * 2 / 7;
            w.beginPath(); w.moveTo(px + Math.cos(a) * 14, py + Math.sin(a) * 14);
            w.lineTo(px + Math.cos(a) * 29, py + Math.sin(a) * 29); w.stroke();
          }
        }
        const canvas = make(800, 534), c = canvas.getContext('2d');
        c.fillStyle = '#20191e'; c.fillRect(0, 0, 800, 534);
        c.fillStyle = '#f4d1b8'; c.font = 'bold 23px sans-serif'; c.fillText(`${index + 1}. ${titles[index]}`, 18, 31);
        c.font = '15px sans-serif'; c.fillStyle = '#bfa9a4'; c.fillText(subtitles[index], 18, 55);
        c.drawImage(world, 0, 0, 1600, 900, 0, 66, 800, 450);
        if (s.opacity < 1) { c.fillStyle = `rgba(20,14,20,${1 - s.opacity})`; c.fillRect(0, 66, 800, 450); }
        c.fillStyle = '#20191e'; c.fillRect(0, 488, 800, 46);
        c.font = 'bold 16px sans-serif'; c.fillStyle = s.impact ? '#ffdf90' : '#f4d1b8';
        c.fillText(t >= 2200 ? 'ИСХОДНАЯ СТОЙКА' : s.phase, 18, 517);
        c.font = '12px sans-serif'; c.fillStyle = '#bfa9a4'; c.textAlign = 'right';
        c.fillText('ЧЕРНОВИК · ГОТОВЫЕ СПРАЙТЫ', 782, 517);
        frames[ids[index]].push(canvas.toDataURL('image/png').split(',')[1]);
        timeline[ids[index]].push({ t, ...s, ground: 820, ...metadata(s.key) });
      }
    }
    return { frames, timeline };
  }, { sources, manifest });
  await mkdir(resolve(root, 'rendered'), { recursive: true });
  for (const [id, frames] of Object.entries(result.frames)) {
    await mkdir(resolve(root, 'rendered', id), { recursive: true });
    for (let i = 0; i < frames.length; i++) await writeFile(resolve(root, 'rendered', id, `${String(i).padStart(3, '0')}.png`), Buffer.from(frames[i], 'base64'));
  }
  const timeline = '{\n' + Object.entries(result.timeline).map(([id, states]) =>
    `  "${id}": [\n${states.map(s => '    ' + JSON.stringify(s)).join(',\n')}\n  ]`).join(',\n') + '\n}\n';
  await writeFile(resolve(root, 'timeline.json'), timeline);
  await writeFile(resolve(root, 'source-manifest.json'), JSON.stringify(sources.map(({ url: _, ...s }) => s), null, 2) + '\n');
  console.log('Rendered 2 × 130 frames from original runtime sprites and anchors');
} finally { await browser.close(); }
