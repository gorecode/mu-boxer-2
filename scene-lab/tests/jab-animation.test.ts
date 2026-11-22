import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { boxerPose, jabFrame } from '../src/fight/boxer-animation.ts';
import { createFight, idleInput, moves, stepFight } from '../src/fight/model.ts';
import { editCel, resetCels } from '../src/fight/moves.ts';

function player(time = 0) {
  const f = createFight().player;
  f.action = { kind: 'jab', time, connected: false };
  return f;
}
test('jab plays startup drawings, holds full extension throughout contact, then retracts', () => {
  const cases: [number, number | null][] = [[0, null], [.039999, null], [.04, 0], [.079999, 0], [.08, null], [.159999, null], [.16, 1], [.179999, 1], [.18, null], [.239999, null], [.24, null], [.339999, null]];
  for (const [time, frame] of cases) assert.equal(jabFrame(player(time)), frame, `time=${time}`);
  assert.equal(moves.jab.windup, .08); assert.equal(moves.jab.active, .08); assert.equal(moves.jab.range, 338);
});
test('reactions, defeat, airborne punches, crouch recovery and edited poses override the clip', () => {
  const f = player(.12);
  for (const reaction of ['light', 'heavy', 'guard', 'launch', 'down'] as const) { f.reaction = reaction; assert.equal(jabFrame(f), null); }
  f.reaction = null; f.hp = 0; assert.equal(jabFrame(f), null);
  f.hp = 100; f.hurt = .1; assert.equal(jabFrame(f), null);
  f.hurt = 0; f.y = 1; assert.equal(jabFrame(f), null);
  f.y = 0; f.crouch = true; f.action!.time = .3; assert.equal(jabFrame(f), null);
  f.crouch = false; f.action!.kind = 'cross'; assert.equal(jabFrame(f), null);
  f.action = null; assert.equal(jabFrame(f), null);
  try {
    editCel('jab', 1, { pose: 9 }); assert.equal(jabFrame(player(.12)), null);
    editCel('jab', 0, { duration: .2 }); assert.equal(jabFrame(player(.15)), 0);
  } finally { resetCels(); }
});
test('hitstop freezes extension, damage happens once and the move returns to idle, mirrored', () => {
  for (const facing of [1, -1] as const) {
    const s = createFight('street', true); s.phase = 'fighting'; s.player.x = 700; s.worker.x = 700 + facing * 220;
    s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
    let found = false;
    for (let i = 0; i < 100; i++) {
      const before = s.player.action?.time, stopped = s.player.stop > 1/120;
      stepFight(s, { ...idleInput(), light: i === 0 }, 1/120);
      if (stopped) { assert.equal(s.player.action?.time, before); assert.equal(jabFrame(s.player), null); assert.equal(boxerPose(s.player), 2); found = true; }
    }
    assert.ok(found); assert.equal(s.hits, 1); assert.equal(s.worker.hp, 112); assert.equal(s.player.action, null);
  }
});
test('runtime loads exactly the two approved in-betweens without altering their pixels', () => {
  const root = new URL('../public/art/fight/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.jab.length, 2);
  assert.deepEqual(manifest.jab[0], { width: 500, height: 530, anchorX: 164, anchorY: 495, scale: 1.19 });
  for (const [i, source] of [2, 12].entries()) {
    assert.deepEqual(manifest.jab[i], manifest.jab[0]);
    const bytes = readFileSync(new URL(`jab-hybrid/jab-${i}.webp`, root));
    assert.deepEqual(bytes, readFileSync(new URL(`jab/jab-${source}.webp`, root)));
  }
});

test('editor durations retime each segment without extending contact into the return', () => {
  try {
    editCel('jab', 0, { duration: .16 });
    editCel('jab', 1, { duration: .2 });
    editCel('jab', 2, { duration: .16 });
    editCel('jab', 3, { duration: .2 });
    for (const [time, frame] of [[.079999, null], [.08, 0], [.159999, 0], [.16, null], [.359999, null], [.36, 1], [.399999, 1], [.40, null], [.52, null], [.68, null]] as const) {
      assert.equal(jabFrame(player(time)), frame, `retimed time=${time}`);
    }
  } finally { resetCels(); }
});

test('hybrid uses the original whole-body contact and returns visually to idle before recovery ends', () => {
  for (const [time, clip, pose] of [[0, null, 0], [.04, 0, 0], [.08, null, 2], [.16, 1, 0], [.18, null, 0], [.33, null, 0]] as const) {
    const f = player(time);
    assert.equal(jabFrame(f), clip); assert.equal(boxerPose(f), pose);
  }
  const s = createFight('street', true); s.phase = 'fighting'; s.player.action = {kind: 'jab', time: .18, connected: false};
  stepFight(s, {...idleInput(), heavy: true}, 1/120);
  assert.equal(s.player.action?.kind, 'jab', 'idle drawing does not unlock a whiff cancel');
});
