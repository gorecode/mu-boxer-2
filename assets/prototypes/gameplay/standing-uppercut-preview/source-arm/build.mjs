import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { source, lengths, upperPolygon, forePolygon, contacts, pose, preparation, drive, schedule } from './geometry.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const project = resolve(root, '../../../../..');
const original = await readFile(resolve(project, 'scene-lab/public/art/fight/boxer-0.webp'));
const plate = await readFile(resolve(root, 'inputs/shirt-plate-v2.png'));
const { chromium } = createRequire(resolve(project, 'scene-lab/package.json'))('playwright');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const poses = { preparation, drive, ...Object.fromEntries(contacts.map(c => [c.name, pose(c.shoulder, c.target)])) };
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ original, plate, source, upperPolygon, forePolygon, poses }) => {
    const load = async url => { const i = new Image(); i.src = url; await i.decode(); return i; };
    const idle = await load(original), clean = await load(plate);
    if (Math.abs(clean.width / clean.height - 500 / 550) > .025) throw new Error('Plate canvas changed');
    const make = () => Object.assign(document.createElement('canvas'), { width: 500, height: 550 });
    const polygon = (c, points) => { c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); };
    const part = points => { const p = make(), c = p.getContext('2d'); polygon(c, points); c.clip(); c.drawImage(idle,0,0); return p; };
    const upper = part(upperPolygon), fore = part(forePolygon);
    const base = make(), b = base.getContext('2d'); b.drawImage(idle,64,30);
    for (const points of [upperPolygon, forePolygon]) {
      b.save(); b.translate(64,30); polygon(b,points); b.clip(); b.translate(-64,-30); b.drawImage(clean,0,0,500,550); b.restore();
    }
    const head = [[185,15],[289,15],[291,104],[282,125],[268,134],[252,133],[230,126],[202,117],[190,98]];
    const restoreHead = c => { c.save(); polygon(c,head); c.clip(); c.globalCompositeOperation = 'copy'; c.drawImage(idle,64,30); c.restore(); };
    restoreHead(b);
    const frames = {};
    const initial = make(); initial.getContext('2d').drawImage(idle,64,30); frames.idle = initial.toDataURL('image/png');
    function segment(c, image, fromA, fromB, toA, toB) {
      c.save(); c.translate(toA[0],toA[1]);
      c.rotate(Math.atan2(toB[1]-toA[1],toB[0]-toA[0]) - Math.atan2(fromB[1]-fromA[1],fromB[0]-fromA[0]));
      c.translate(-fromA[0],-fromA[1]); c.drawImage(image,0,0); c.restore();
    }
    for (const [name, p] of Object.entries(poses)) {
      const frame = make(), c = frame.getContext('2d'); c.drawImage(base,0,0); c.save(); c.translate(64,30);
      segment(c,upper,source.shoulder,source.elbow,p.shoulder,p.elbow);
      segment(c,fore,source.elbow,source.wrist,p.elbow,p.wrist); c.restore(); restoreHead(c);
      frames[name] = frame.toDataURL('image/png');
    }
    return { frames, base: base.toDataURL('image/png'), upper: upper.toDataURL('image/png'), fore: fore.toDataURL('image/png') };
  }, { original: `data:image/webp;base64,${original.toString('base64')}`, plate: `data:image/png;base64,${plate.toString('base64')}`,
       source, upperPolygon, forePolygon, poses });
  await mkdir(resolve(root,'frames'), { recursive:true });
  for (const [name, data] of Object.entries({ ...result.frames, plate:result.base, upper:result.upper, fore:result.fore }))
    await writeFile(resolve(root,'frames',`${name}.png`),Buffer.from(data.split(',')[1],'base64'));
  await writeFile(resolve(root,'rig.json'), JSON.stringify({ source, lengths, poses, schedule, upperPolygon, forePolygon,
    sourceSha256: createHash('sha256').update(original).digest('hex'), plateSha256: createHash('sha256').update(plate).digest('hex') },null,2)+'\n');
  console.log('Rendered original-texture uppercuts at native scale without segment stretching');
} finally { await browser.close(); }
