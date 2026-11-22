import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {existsSync} from 'node:fs';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(root,'../../../..');
const {chromium}=createRequire(path.join(project,'scene-lab/package.json'))('playwright');
test('preview scrub, play, pause, quarter speed and loop endpoints use the same baked motion', {timeout:30000}, async()=>{
 const b=await chromium.launch({executablePath:existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined,args:['--no-sandbox']});
 try {
  const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install();await p.goto('http://127.0.0.1:4201/assets/prototypes/gameplay/jab-reference-animation/preview.html');await p.waitForFunction(()=>window.previewReady);
  const source=()=>p.locator('#sprite').evaluate(c=>c.toDataURL());const initial=await source();
  const scrub=async n=>p.locator('#time').evaluate((e,n)=>{e.value=String(n);e.dispatchEvent(new Event('input'));},n);
  await scrub(80);assert.notEqual(await source(),initial);await scrub(340);assert.equal(await source(),initial);
  await scrub(0);await p.locator('#play').click();await p.clock.runFor(160);const fast=Number((await p.locator('#stamp').textContent()).split(' ')[0]);assert.ok(fast>=120&&fast<=170);
  await p.locator('#play').click();const frozen=await source();await p.clock.runFor(500);assert.equal(await source(),frozen);
  await scrub(0);await p.locator('#speed').selectOption('0.25');await p.locator('#play').click();await p.clock.runFor(160);const slow=Number((await p.locator('#stamp').textContent()).split(' ')[0]);assert.ok(slow>=25&&slow<=45);assert.ok(Math.abs(slow*4-fast)<=20);assert.deepEqual(errors,[]);
 } finally { await b.close(); }
});
