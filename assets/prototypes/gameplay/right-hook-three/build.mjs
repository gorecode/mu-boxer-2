import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('./', import.meta.url));
const project = resolve(root, '../../../..');
const config = JSON.parse(await readFile(resolve(root, 'poses.json'), 'utf8'));
const files = { idle: '../head-hook-preview/frames/idle.png', arena: '../../../../scene-lab/public/art/fight/arena.webp',
  ...Object.fromEntries(config.map(pose => [pose.name, `inputs/${pose.name}.png`])) };
const urls = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, path]) => [name,
  `data:image/${path.endsWith('webp') ? 'webp' : 'png'};base64,${(await readFile(resolve(root, path))).toString('base64')}`])));
const { chromium } = createRequire(resolve(project, 'scene-lab/package.json'))('playwright');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ urls, config }) => {
    const make = (width = 500, height = 530) => Object.assign(document.createElement('canvas'), { width, height });
    const images = {}, frames = {}, registration = [];
    for (const [name, url] of Object.entries(urls)) {
      const image = new Image(); image.src = url; await image.decode(); images[name] = image;
    }
    const idle = make(); idle.getContext('2d').drawImage(images.idle, 0, 0); frames.idle = idle;
    for (const pose of config) {
      const image = images[pose.name], source = make(image.width, image.height), s = source.getContext('2d');
      s.drawImage(image, 0, 0);
      const pixels = s.getImageData(0, 0, source.width, source.height).data;
      let minY = Infinity, maxY = -1, toeX = -1, soleY = -1, footCount = 0;
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        if (pixels[(y * source.width + x) * 4 + 3] <= 24) continue;
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (y > source.height * .85 && x > source.width * .6) {
          toeX = Math.max(toeX, x); soleY = Math.max(soleY, y); footCount++;
        }
      }
      if (footCount < 100) throw new Error(`Missing reference foot: ${pose.name}`);
      const scale = 480 / (maxY - minY + 1), x = 344 - toeX * scale, y = 485 - soleY * scale;
      const canvas = make(), ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, x, y, source.width * scale, source.height * scale);
      if (pose.headOffset) {
        const head = make(), h = head.getContext('2d');
        h.beginPath(); [[194,0],[286,0],[286,67],[280,93],[270,104],[251,99],[235,86],[209,83],[194,67]]
          .forEach(([x, y], i) => i ? h.lineTo(x, y) : h.moveTo(x, y)); h.closePath(); h.clip(); h.drawImage(idle, 0, 0);
        const [dx, dy] = pose.headOffset;
        ctx.clearRect(...pose.eraseHair);
        ctx.drawImage(head, dx, dy);
        const from = h.getImageData(0, 0, 500, 530).data, output = ctx.getImageData(0, 0, 500, 530);
        for (let sy = 0; sy < 104; sy++) for (let sx = 194; sx < 286; sx++) {
          const a = (sy * 500 + sx) * 4, b = ((sy + dy) * 500 + sx + dx) * 4;
          if (from[a + 3] >= 240) output.data.set(from.subarray(a, a + 4), b);
        }
        ctx.putImageData(output, 0, 0);
      }
      frames[pose.name] = canvas;
      registration.push({ ...pose, x, y, scale, toe: [344, 485] });
    }
    const panels = {}, png = canvas => canvas.toDataURL().split(',')[1];
    for (const [name, frame] of Object.entries(frames)) {
      const world = make(1600, 900), w = world.getContext('2d'); w.drawImage(images.arena, 0, 0, 1600, 900);
      w.save(); w.translate(530, 820); w.scale(1.19, 1.19); w.drawImage(frame, -228, -495); w.restore();
      const panel = make(500, 475); panel.getContext('2d').drawImage(world, 215, 175, 700, 665, 0, 0, 500, 475);
      panels[name] = png(panel);
    }
    return { frames: Object.fromEntries(Object.entries(frames).map(([name, frame]) => [name, png(frame)])), panels, registration };
  }, { urls, config });
  for (const folder of ['frames', 'panels']) {
    await mkdir(resolve(root, folder), { recursive: true });
    for (const [name, data] of Object.entries(result[folder])) await writeFile(resolve(root, folder, `${name}.png`), Buffer.from(data, 'base64'));
  }
  await writeFile(resolve(root, 'registration.json'), JSON.stringify(result.registration, null, 2) + '\n');
  console.log('Rendered three right-hook contacts, shared idle and arena panels');
} finally { await browser.close(); }
