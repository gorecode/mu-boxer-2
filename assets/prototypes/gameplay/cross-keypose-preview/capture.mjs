import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { durationMs } from './schedule.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const project = resolve(root, '../../../..');
const { chromium } = createRequire(resolve(project, 'scene-lab/package.json'))('playwright');
const server = createServer(async (request, response) => {
  const path = resolve(project, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!path.startsWith(project + sep)) { response.writeHead(403).end(); return; }
  try {
    const mime = { '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp' };
    const contents = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
    response.end(contents);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 650 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/assets/prototypes/gameplay/cross-keypose-preview/preview.html`);
  await page.waitForFunction(() => window.ready);
  await mkdir(resolve(root, '.capture'), { recursive: true });
  await mkdir(resolve(root, 'frames'), { recursive: true });
  const { frames, stage } = await page.evaluate(() => window.crossPreview);
  for (const [name, frame] of Object.entries(frames)) await writeFile(resolve(root, `frames/${name}.png`), Buffer.from(frame, 'base64'));
  await writeFile(resolve(root, 'stage.json'), JSON.stringify(stage, null, 2) + '\n');
  const records = [];
  for (let ms = 0; ms <= durationMs; ms += 10) {
    const { png, ...record } = await page.evaluate(ms => window.crossPreview.render(ms), ms);
    await writeFile(resolve(root, `.capture/${String(ms).padStart(4, '0')}.png`), Buffer.from(png, 'base64'));
    records.push({ ms, ...record });
  }
  assert.equal(records.length, 121);
  assert.deepEqual(records[0].poses, ['idle','idle','idle']);
  assert.deepEqual(records.at(-1).poses, ['idle','idle','idle']);
  assert.deepEqual([0,1,2].map(j=>new Set(records.map(r=>r.poses[j])).size),[2,3,4]);
  assert.deepEqual(errors, []);
  await writeFile(resolve(root, '.capture/route.json'), JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify({ captures: records.length, browserErrors: errors, uniqueDrawings: [2, 3, 4] }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
