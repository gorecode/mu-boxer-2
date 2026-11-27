import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { boxerPose, crossFrame, jabFrame, walkFrame } from '../src/fight/boxer-animation.ts';
import { createFight, idleInput, stepFight, pauseFight, resumeFight, copyTraining, moves } from '../src/fight/model.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';
import { editCel, resetCels, crouching } from '../src/fight/moves.ts';

const dt = 1 / 120;
function ready(facing: 1 | -1 = 1) {
  const s = createFight('street', true); s.phase = 'fighting';
  s.player.x = 800; s.worker.x = 800 + facing * 180;
  s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  return s;
}

test('held down plus block shows selected A; releasing either input returns immediately without moving root', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(facing), step = (down: boolean, block: boolean) => stepFight(s, { ...idleInput(), down, block }, dt);
    step(true, false); assert.equal(boxerPose(s.player), 5);
    const geometry = fighterGeometry(s.player);
    for (let i = 0; i < 30; i++) step(true, true);
    assert.equal(boxerPose(s.player), 25); assert.equal(s.player.x, 800); assert.equal(s.player.y, 0);
    assert.deepEqual(fighterGeometry(s.player), geometry);
    assert.equal(jabFrame(s.player), null); assert.equal(crossFrame(s.player), null); assert.equal(walkFrame(s.player), null);
    step(true, false); assert.equal(boxerPose(s.player), 5);
    step(true, true); assert.equal(boxerPose(s.player), 25);
    step(false, true); assert.equal(boxerPose(s.player), 4);
    step(false, false); assert.equal(boxerPose(s.player), 0);
  }
});

test('low contact preserves A through guard reaction, hitstop, pause and training restore', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(facing);
    s.worker.action = { kind: 'sweep', time: moves.sweep.windup - dt, connected: false };
    stepFight(s, { ...idleInput(), down: true, block: true }, dt);
    assert.equal(s.player.hp, 100); assert.ok(s.player.guard < 100);
    assert.equal(s.player.reaction, 'guard'); assert.equal(boxerPose(s.player), 25);
    assert.ok(s.events.some(e => e.type === 'block' && e.target === 'player'));
    const saved = copyTraining(s); pauseFight(s);
    stepFight(s, idleInput(), dt); assert.equal(boxerPose(s.player), 25);
    resumeFight(s); stepFight(s, idleInput(), dt); assert.equal(boxerPose(s.player), 25);
    assert.equal(boxerPose(saved.player), 25); assert.equal(saved.player.reaction, 'guard');
    s.worker.action = null;
    for (let i = 0; i < 50; i++) stepFight(s, { ...idleInput(), down: true }, dt);
    assert.equal(boxerPose(s.player), 5);
  }
});

test('overhead and guard break replace low guard with hurt; attacks and air cannot display a held block', () => {
  for (const kind of ['overhead', 'sweep'] as const) {
    const s = ready(); if (kind === 'sweep') s.player.guard = 1;
    s.worker.action = { kind, time: moves[kind].windup - dt, connected: false };
    stepFight(s, { ...idleInput(), down: true, block: true }, dt);
    assert.equal(boxerPose(s.player), 6);
    assert.equal(s.player.blocking, false);
    assert.ok(s.events.some(e => e.type === (kind === 'sweep' ? 'break' : 'hit')));
  }
  const s = ready(); s.player.action = { kind: 'jab', time: 0, connected: false };
  stepFight(s, { ...idleInput(), down: true, block: true }, dt);
  assert.equal(s.player.blocking, false); assert.notEqual(boxerPose(s.player), 25);
  s.player.action = null; s.player.y = 80;
  stepFight(s, { ...idleInput(), down: true, block: true }, dt);
  assert.equal(s.player.blocking, false); assert.equal(boxerPose(s.player), 7);
  s.player.hp = 0; s.player.reaction = 'guard'; assert.equal(boxerPose(s.player), 11);
});

test('editor accepts guard pose, rejects out-of-range poses and resets', () => {
  const before = structuredClone(moves.jab.cels);
  try {
    editCel('jab', 0, { pose: 25 });
    assert.equal(moves.jab.cels[0].pose, 25);
    assert.deepEqual(moves.jab.cels[0].hurt, crouching);
    assert.throws(() => editCel('jab', 0, { pose: 28 }), RangeError);
    assert.equal(moves.jab.cels[0].pose, 25);
  } finally { resetCels(); }
  assert.deepEqual(moves.jab.cels, before);
});

test('runtime guard hash and origin match the approved registered A drawing', () => {
  const audit = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/crouch-block-preview/runtime-assets.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.boxer.length, 28); assert.equal(audit.pose, 25); assert.equal(audit.rgba_matches_preview, true);
  assert.deepEqual(manifest.boxer[25], { width: 500, height: 550, anchorX: 228, anchorY: 525, scale: 1.19 });
  const bytes = readFileSync(new URL('../public/art/fight/boxer-25.webp', import.meta.url));
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), audit.runtime_sha256);
});
