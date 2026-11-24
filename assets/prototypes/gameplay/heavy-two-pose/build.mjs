import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('./', import.meta.url));
const project = resolve(root, '../../../..');
const { chromium } = createRequire(resolve(project, 'scene-lab/package.json'))('playwright');
const inputs = {
  idle: 'assets/prototypes/gameplay/head-hook-preview/frames/idle.png',
  hook: 'assets/prototypes/gameplay/head-hook-preview/frames/left-contact.png',
  overhand: 'assets/prototypes/gameplay/heavy-two-pose/inputs/overhand.png',
  body: 'assets/prototypes/gameplay/heavy-two-pose/inputs/body.png',
  right: 'assets/prototypes/gameplay/heavy-two-pose/inputs/right.png',
  arena: 'scene-lab/public/art/fight/arena.webp',
};
const urls = Object.fromEntries(await Promise.all(Object.entries(inputs).map(async ([key, path]) => [key,
  `data:image/${path.endsWith('webp') ? 'webp' : 'png'};base64,${(await readFile(resolve(project, path))).toString('base64')}`])));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async urls => {
    const images = {};
    for (const [key, url] of Object.entries(urls)) {
      const image = new Image(); image.src = url; await image.decode(); images[key] = image;
    }
    const make = (width = 500, height = 530) => Object.assign(document.createElement('canvas'), { width, height });
    const png = canvas => canvas.toDataURL().split(',')[1];
    const frames = {}, registration = [];
    for (const name of ['idle', 'hook', 'overhand', 'body', 'right']) {
      const image = images[name], c = make(), ctx = c.getContext('2d');
      if (name === 'idle' || name === 'hook') ctx.drawImage(image, 0, 0);
      else {
        const raw = make(image.width, image.height), r = raw.getContext('2d'); r.drawImage(image, 0, 0);
        const data = r.getImageData(0, 0, image.width, image.height).data;
        let minY = Infinity, maxY = -1, toeX = -1, soleY = -1, count = 0;
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          if (data[(y * image.width + x) * 4 + 3] <= 24) continue;
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          if (y > image.height * .85 && x > image.width * .6) {
            toeX = Math.max(toeX, x); soleY = Math.max(soleY, y); count++;
          }
        }
        if (count < 100) throw new Error(`Missing foot: ${name}`);
        const scale = (name === 'body' ? 440 : 480) / (maxY - minY + 1);
        const x = 344 - toeX * scale, y = 485 - soleY * scale;
        ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
        const headOffset = name === 'right' ? [5, 0] : name === 'body' ? [13, 46] : [-9, 14];
        const erase = name === 'right'
          ? [[192,0],[300,0],[300,65],[192,65]]
          : name === 'body'
          ? [[201,31],[309,31],[309,113],[298,149],[269,145],[246,130],[217,124],[201,101]]
          : [[181,0],[286,0],[286,90],[273,119],[246,111],[226,102],[202,104],[181,82]];
        ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath();
        erase.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); ctx.restore();
        const head = make(), h = head.getContext('2d');
        h.beginPath(); [[194,0],[286,0],[286,67],[280,93],[270,104],[251,99],[235,86],[209,83],[194,67]]
          .forEach(([x, y], i) => i ? h.lineTo(x, y) : h.moveTo(x, y)); h.closePath(); h.clip(); h.drawImage(images.idle, 0, 0);
        ctx.drawImage(head, ...headOffset);
        const original = h.getImageData(0, 0, 500, 530).data, output = ctx.getImageData(0, 0, 500, 530);
        for (let sy = 0; sy < 104; sy++) for (let sx = 194; sx < 286; sx++) {
          const from = (sy * 500 + sx) * 4, to = ((sy + headOffset[1]) * 500 + sx + headOffset[0]) * 4;
          if (original[from + 3] >= 240) output.data.set(original.subarray(from, from + 4), to);
        }
        ctx.putImageData(output, 0, 0);
        registration.push({ name, x, y, scale, toe: [344, 485], figureHeight: name === 'body' ? 440 : 480, headOffset });
      }
      frames[name] = c;
    }
    const panels = {};
    for (const name of ['idle', 'hook', 'overhand', 'body', 'right']) {
      const world = make(1600, 900), w = world.getContext('2d'); w.drawImage(images.arena, 0, 0, 1600, 900);
      w.save(); w.translate(530, 820); w.scale(1.19, 1.19); w.drawImage(frames[name], -228, -495); w.restore();
      const panel = make(500, 475); panel.getContext('2d').drawImage(world, 215, 175, 700, 665, 0, 0, 500, 475);
      panels[name] = png(panel);
    }
    return { frames: Object.fromEntries(Object.entries(frames).map(([name, c]) => [name, png(c)])), panels, registration };
  }, urls);
  for (const folder of ['frames', 'panels']) {
    await mkdir(resolve(root, folder), { recursive: true });
    for (const [name, data] of Object.entries(result[folder])) await writeFile(resolve(root, folder, `${name}.png`), Buffer.from(data, 'base64'));
  }
  await writeFile(resolve(root, 'registration.json'), JSON.stringify(result.registration, null, 2) + '\n');
  console.log('Rendered five native drawings and arena panels');
} finally { await browser.close(); }
