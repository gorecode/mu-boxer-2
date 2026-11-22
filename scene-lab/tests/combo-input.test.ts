import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFight, copyTraining, idleInput, moves, pauseFight, resumeFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
const dt = 1/120;
function ready(facing: 1 | -1 = 1, wall = false) {
  const s = createFight('street', true); s.phase = 'fighting'; s.training.dummy = 'after-hit';
  s.worker.x = wall ? facing === 1 ? 1385 : 215 : facing === 1 ? 1000 : 600;
  s.player.x = s.worker.x - facing * 220; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  return s;
}
function advance(s: Fight, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds/dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}
test('human-paced light-light-heavy presses queue through startup and hitstop, mirrored and at walls', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) for (const gap of [.04, .08, .12, .18, .24]) {
    const s = ready(facing, wall);
    advance(s, dt, { light: true }); advance(s, gap-dt);
    advance(s, dt, { light: true }); advance(s, gap-dt);
    advance(s, dt, { heavy: true }); advance(s, 1);
    assert.equal(s.hits, 3, `gap=${gap} facing=${facing} wall=${wall}`); assert.equal(s.worker.hp, 90);
    assert.equal(s.training.gap, false); assert.deepEqual(s.comboQueue, []);
  }
});
test('three taps between render frames keep order and alternate the planned hands', () => {
  const s = ready(); stepFight(s, { ...idleInput(), attackPresses: ['light', 'light', 'heavy'] }, dt);
  assert.equal(s.player.action?.kind, 'jab'); assert.deepEqual(s.comboQueue, ['cross', 'heavy']);
  advance(s, 1); assert.equal(s.hits, 3); assert.equal(s.worker.hp, 90); assert.equal(s.training.gap, false);
});
test('heavy-upper continuation entered early survives heavy startup rather than expiring', () => {
  const s = ready(); advance(s, dt, { light: true }); advance(s, .05);
  advance(s, dt, { heavy: true }); advance(s, .05);
  advance(s, dt, { down: true, heavy: true, attackPressed: 'upper' }); advance(s, 1);
  assert.equal(s.hits, 3); assert.equal(s.worker.hp, 78); assert.equal(s.training.gap, false);
});
test('block and whiff discard planned follow-ups instead of creating automatic attacks after recovery', () => {
  for (const guard of [false, true]) {
    const s = ready(); if (guard) s.training.dummy = 'guard'; else s.worker.x = s.player.x + 650;
    advance(s, dt, { attackPresses: ['light', 'light', 'heavy'] }); advance(s, .22);
    assert.equal(s.player.action?.kind, 'jab'); assert.equal(s.worker.hp, 120);
    advance(s, 1); assert.equal(s.player.action, null); assert.deepEqual(s.comboQueue, []); assert.equal(s.hits, 0);
  }
});
test('pause, snapshots, blocking and incoming hits discard queued series', () => {
  for (const reason of ['pause', 'snapshot', 'block', 'hit'] as const) {
    const s = ready(); advance(s, dt, { attackPresses: ['light', 'light', 'heavy'] }); assert.equal(s.comboQueue.length, 2);
    if (reason === 'pause') { pauseFight(s); resumeFight(s); }
    if (reason === 'snapshot') { assert.deepEqual(copyTraining(s).comboQueue, []); continue; }
    if (reason === 'block') advance(s, dt, { block: true });
    if (reason === 'hit') { s.worker.action = { kind: 'sweep', time: moves.sweep.windup, connected: false }; advance(s, dt); }
    assert.deepEqual(s.comboQueue, []); advance(s, 1); assert.ok(s.hits <= 1);
  }
});
test('holding light never fills a combo queue and three-hit chain cannot grow without bound', () => {
  const held = ready(); advance(held, 1, { light: true }); assert.equal(held.hits, 1); assert.deepEqual(held.comboQueue, []);
  const spam = ready(); advance(spam, dt, { attackPresses: ['light', 'light', 'heavy', 'upper'] });
  assert.deepEqual(spam.comboQueue, ['cross', 'heavy']); advance(spam, 1.5); assert.equal(spam.hits, 3);
});

test('special commands tolerate released direction, expire, mirror and do not leak through pause', () => {
  for (const facing of [1, -1] as const) {
    for (const [direction, kind] of [['down', 'upper'], ['up', 'overhand'], [facing === 1 ? 'left' : 'right', 'backfist']] as const) {
      const s = ready(facing); advance(s, .03, { [direction]: true }); advance(s, .08);
      advance(s, dt, { heavy: true }); assert.equal(s.player.action?.kind, kind);
      const expired = ready(facing); advance(expired, .03, { [direction]: true }); advance(expired, .2);
      advance(expired, dt, { heavy: true }); assert.equal(expired.player.action?.kind, 'heavy');
      const paused = ready(facing); advance(paused, dt, { [direction]: true }); pauseFight(paused); resumeFight(paused);
      advance(paused, dt, { heavy: true }); assert.equal(paused.player.action?.kind, 'heavy');
    }
    const s = ready(facing), toward = facing === 1 ? { right: true } : { left: true };
    advance(s, .05, toward); advance(s, .05); advance(s, .05, toward); advance(s, .08);
    advance(s, dt, { heavy: true }); assert.equal(s.player.action?.kind, 'long');
    const airborne = ready(facing); advance(airborne, dt, { down: true }); airborne.player.y = 100; airborne.player.vy = 100;
    advance(airborne, dt, { heavy: true }); assert.equal(airborne.player.action?.kind, 'heavy');
  }
});

test('dodge retains priority over attack taps and discards the planned series', () => {
  const s = ready(); advance(s, dt, { attackPresses: ['light', 'light', 'heavy'], dodge: true });
  assert.ok(s.player.dodge > 0); assert.equal(s.player.action, null); assert.deepEqual(s.comboQueue, []);
  advance(s, 1); assert.equal(s.hits, 0);
});
