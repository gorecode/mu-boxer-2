import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { jabFrame } from '../src/fight/boxer-animation.ts';
import { createFight, idleInput, moves, stepFight } from '../src/fight/model.ts';
import { editCel, resetCels } from '../src/fight/moves.ts';

function player(time = 0) {
  const f = createFight().player;
  f.action = { kind: 'jab', time, connected: false };
  return f;
}
test('jab plays startup drawings, holds full extension throughout contact, then retracts', () => {
  const cases = [[0, 0], [.019999, 0], [.02, 1], [.039999, 1], [.04, 2], [.06, 3], [.079999, 3], [.08, 4], [.159999, 4], [.16, 8], [.18, 9], [.20, 10], [.22, 11], [.24, 12], [.26, 13], [.28, 14], [.30, 15], [.32, 16], [.339999, 16]];
  for (const [time, frame] of cases) assert.equal(jabFrame(player(time)), frame, `time=${time}`);
  assert.equal(moves.jab.windup, .08); assert.equal(moves.jab.active, .08); assert.equal(moves.jab.range, 331);
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
    editCel('jab', 0, { duration: .2 }); assert.equal(jabFrame(player(.15)), 3);
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
      if (stopped) { assert.equal(s.player.action?.time, before); assert.equal(jabFrame(s.player), 4); found = true; }
    }
    assert.ok(found); assert.equal(s.hits, 1); assert.equal(s.worker.hp, 112); assert.equal(s.player.action, null);
  }
});
test('runtime drawings share registration, are hydrated and have identical loop endpoints', () => {
  const root = new URL('../public/art/fight/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.jab.length, 18);
  assert.deepEqual(manifest.jab[0], { width: 500, height: 530, anchorX: 164, anchorY: 495, scale: 1.19 });
  for (let i = 0; i < 18; i++) {
    assert.deepEqual(manifest.jab[i], manifest.jab[0]);
    const bytes = readFileSync(new URL(`jab/jab-${i}.webp`, root));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  }
  assert.deepEqual(readFileSync(new URL('jab/jab-0.webp', root)), readFileSync(new URL('jab/jab-17.webp', root)));
});

test('editor durations retime each segment without extending contact into the return', () => {
  try {
    editCel('jab', 0, { duration: .16 });
    editCel('jab', 1, { duration: .2 });
    editCel('jab', 2, { duration: .16 });
    editCel('jab', 3, { duration: .2 });
    for (const [time, frame] of [[.04, 1], [.12, 3], [.16, 4], [.359999, 4], [.36, 8], [.40, 9], [.48, 11], [.52, 12], [.56, 13], [.68, 16]]) {
      assert.equal(jabFrame(player(time)), frame, `retimed time=${time}`);
    }
  } finally { resetCels(); }
});
