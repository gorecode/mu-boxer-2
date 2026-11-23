import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxerPose } from '../src/fight/boxer-animation.ts';
import { createFight, moves } from '../src/fight/model.ts';

test('straight punches anticipate from stance and retract on the first non-contact frame', () => {
  for (const kind of ['jab', 'cross', 'heavy', 'long', 'backfist'] as const) {
    const f = createFight().player, m = moves[kind];
    assert.equal(boxerPose(f), 0);
    f.action = { kind, time: 0, connected: false }; assert.equal(boxerPose(f), 0);
    f.action.time = m.windup - 1e-6; assert.equal(boxerPose(f), 0);
    f.action.time = m.windup; assert.ok([2, 3].includes(boxerPose(f)));
    f.action.time = m.windup + m.active; assert.equal(boxerPose(f), 0);
    f.action.time += m.cels[2].duration; assert.equal(boxerPose(f), 0);
    f.action = null; assert.equal(boxerPose(f), 0);
  }
});

test('overhand raises guard rather than winding up in an already landed uppercut pose', () => {
  const f = createFight().player; f.action = { kind: 'overhand', time: 0, connected: false };
  assert.equal(boxerPose(f), 4);
  f.action.time = moves.overhand.windup; assert.equal(boxerPose(f), 3);
  f.action.time += moves.overhand.active; assert.equal(boxerPose(f), 0);
});

test('crouching attacks return to crouch without an extra stand-crouch flicker', () => {
  for (const kind of ['low', 'upper'] as const) {
    const f = createFight().player, m = moves[kind]; f.crouch = true;
    f.action = { kind, time: 0, connected: false }; assert.equal(boxerPose(f), 5);
    f.action.time = m.windup + m.active + m.cels[2].duration; assert.equal(boxerPose(f), 5);
    f.action = null; assert.equal(boxerPose(f), 5);
    f.crouch = false; assert.equal(boxerPose(f), 0);
  }
});

test('walking falls back to original stance while dodge and airborne poses stay separate', () => {
  const f = createFight().player; f.velocity = 355;
  const walk = new Set<number>();
  for (let travel = 0; travel < 500; travel += 7) { f.travel = travel; walk.add(boxerPose(f)); }
  assert.deepEqual([...walk].sort(), [0]);
  f.dodge = .18; assert.equal(boxerPose(f), 1);
  f.dodge = 0; f.y = 50; assert.equal(boxerPose(f), 7);
  f.y = 0; f.velocity = 0; assert.equal(boxerPose(f), 0);
});

test('hurt, block and defeat override the attack and edited cel poses remain visible', () => {
  const f = createFight().player; f.action = { kind: 'jab', time: moves.jab.windup, connected: false };
  f.reaction = 'guard'; assert.equal(boxerPose(f), 4);
  f.crouch = true; assert.equal(boxerPose(f), 5);
  f.reaction = 'heavy'; assert.equal(boxerPose(f), 6);
  f.hp = 0; assert.equal(boxerPose(f), 11);
  f.hp = 100; f.reaction = null; f.crouch = false;
  const cel = moves.jab.cels[1], original = cel.pose;
  try { cel.pose = 9; assert.equal(boxerPose(f), 9); } finally { cel.pose = original; }
});
