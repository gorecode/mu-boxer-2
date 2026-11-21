import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandState, observeDirections, heavyCommand } from '../src/fight/commands.ts';
import { createFight, idleInput, stepFight, pauseFight, resumeFight, type Input } from '../src/fight/model.ts';
const dt = 1/120;
function ready(facing: 1 | -1 = 1) {
  const s = createFight('street', true); s.phase = 'fighting'; s.worker.x = facing === 1 ? 1000 : 600;
  s.player.x = s.worker.x - facing * 220; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  return s;
}
function advance(s: ReturnType<typeof ready>, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}
test('MK directions mirror with facing; double taps expire and cannot be reused or built from holding', () => {
  for (const facing of [1, -1] as const) {
    const state = commandState(), forward = { ...idleInput(), [facing === 1 ? 'right' : 'left']: true };
    const back = { ...idleInput(), [facing === 1 ? 'left' : 'right']: true };
    observeDirections(state, forward, facing, 0); observeDirections(state, forward, facing, .1);
    assert.equal(heavyCommand(state, forward, facing, .1), 'heavy');
    observeDirections(state, idleInput(), facing, .12); observeDirections(state, forward, facing, .2);
    assert.equal(heavyCommand(state, forward, facing, .2), 'long');
    assert.equal(heavyCommand(state, forward, facing, .21), 'heavy');
    assert.equal(heavyCommand(state, back, facing, .22), 'backfist');
    observeDirections(state, idleInput(), facing, .3); observeDirections(state, forward, facing, .6);
    assert.equal(heavyCommand(state, forward, facing, .6), 'heavy');
    observeDirections(state, idleInput(), facing, .65); observeDirections(state, forward, facing, .7);
    assert.equal(heavyCommand(state, forward, facing, .87), 'heavy');
    observeDirections(state, forward, -facing, .88);
    assert.equal(state.forwardDouble, -Infinity);
  }
});
test('single down chord is overhand, double down is upper; pause clears directional history', () => {
  const single = ready(); advance(single, dt, { down: true, heavy: true }); assert.equal(single.player.action?.kind, 'overhand');
  const double = ready(); advance(double, dt, { down: true }); advance(double, dt);
  advance(double, dt, { down: true, heavy: true }); assert.equal(double.player.action?.kind, 'upper');
  const paused = ready(); advance(paused, dt, { down: true }); pauseFight(paused); resumeFight(paused);
  advance(paused, dt, { down: true, heavy: true }); assert.equal(paused.player.action?.kind, 'overhand');
});
test('light presses alternate hands, hit-confirm into the second hand, and cannot loop cancels', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(facing); s.training.dummy = 'after-hit'; advance(s, .13, { light: true }); assert.equal(s.hits, 1);
    advance(s, dt); advance(s, dt, { light: true }); advance(s, .22);
    assert.equal(s.player.action?.kind, 'cross'); assert.equal(s.hits, 2); assert.equal(s.worker.hp, 104); assert.equal(s.training.gap, false);
    advance(s, dt, { light: true }); advance(s, .08); assert.equal(s.player.action?.kind, 'cross');
    advance(s, .6); assert.equal(s.hits, 2); assert.equal(s.lightHand, 'jab');
    s.training.dummy = 'idle'; s.worker.x = s.player.x + facing * 220;
    advance(s, .16, { light: true }); assert.equal(s.player.action?.kind, 'jab'); assert.equal(s.hits, 3);
  }
  const whiff = ready(); whiff.worker.x = whiff.player.x + 500;
  advance(whiff, .13, { light: true }); advance(whiff, dt); advance(whiff, dt, { light: true }); advance(whiff, .15);
  assert.equal(whiff.player.action?.kind, 'jab'); assert.equal(whiff.hits, 0);
});
test('uppercut carries the airborne victim substantially farther, mirrors and stays inside walls', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(facing), x = s.worker.x; advance(s, dt, { attackPressed: 'upper' }); advance(s, .55);
    assert.equal(s.worker.hp, 97); assert.equal(s.hits, 1); assert.ok(s.worker.y > 0);
    assert.ok((s.worker.x - x) * facing > 140); advance(s, .6); assert.equal(s.worker.y, 0);
    assert.ok(s.worker.x >= 215 && s.worker.x <= 1385);
    const wall = ready(facing); wall.worker.x = facing === 1 ? 1385 : 215; wall.player.x = wall.worker.x - facing * 220;
    advance(wall, dt, { attackPressed: 'upper' }); advance(wall, 1.2);
    assert.equal(wall.worker.x, facing === 1 ? 1385 : 215); assert.equal(wall.hits, 1);
  }
});
test('defensive worker holds ground, blocks repeated jabs with shovel and can answer before the next jab', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) {
    const s = ready(facing);
    if (wall) { s.worker.x = facing === 1 ? 1385 : 215; s.player.x = s.worker.x - facing * 220; }
    s.training.dummy = 'cpu'; s.aiWait = 2; s.brain.observedDistance = 220;
    let blocks = 0, replies = 0;
    for (let i = 0; i < 120 * 6; i++) {
      const input = { ...idleInput(), light: i % 50 === 0, [facing === 1 ? 'right' : 'left']: true };
      stepFight(s, input, dt);
      blocks += s.events.filter(e => e.type === 'block' && e.target === 'worker').length;
      replies += s.events.filter(e => e.type === 'hit' && e.target === 'player').length;
    }
    assert.ok(blocks > 0, 'repeated jabs must meet a real block'); assert.ok(replies > 0, 'a block must allow a real reply');
    assert.ok(s.worker.hp > 40, 'jabs must not lock out every phase');
    const far = ready(facing); far.training.dummy = 'cpu'; far.player.x = far.worker.x - facing * 600;
    far.brain.observedDistance = 600; const x = far.worker.x; advance(far, .8);
    assert.equal(far.worker.x, x); assert.equal(far.worker.action, null);
  }
});
test('far spin closes into punching distance and damages a stationary player; blocking still works', () => {
  for (const facing of [1, -1] as const) for (const block of [false, true]) {
    const s = ready(facing); s.worker.x = facing === 1 ? 1200 : 400; s.player.x = s.worker.x - facing * 740;
    s.worker.action = { kind: 'spin', time: 0, connected: false }; advance(s, 1.8, { block });
    assert.ok(Math.abs(s.worker.x - s.player.x) < 240);
    assert.equal(s.player.hp, block ? 100 : 84);
  }
});

test('second light has real mirrored reach, a guarded first hit cannot cancel, and two hands can finish with heavy', () => {
  for (const facing of [1, -1] as const) {
    for (const [distance, hp] of [[320, 111], [321, 120]] as const) {
      const s = ready(facing); s.player.x = s.worker.x - facing * distance; s.lightHand = 'cross';
      advance(s, .3, { light: true }); assert.equal(s.worker.hp, hp); assert.equal(s.hits, hp < 120 ? 1 : 0);
    }
    const blocked = ready(facing); blocked.training.dummy = 'guard'; advance(blocked, .13, { light: true });
    advance(blocked, dt); advance(blocked, dt, { light: true }); advance(blocked, .12);
    assert.equal(blocked.player.action?.kind, 'jab'); assert.equal(blocked.worker.hp, 120);
    const combo = ready(facing); combo.training.dummy = 'after-hit'; advance(combo, .13, { light: true });
    advance(combo, dt); advance(combo, dt, { light: true }); advance(combo, .22);
    advance(combo, dt, { heavy: true }); advance(combo, .36);
    assert.equal(combo.hits, 3); assert.equal(combo.combo, 3); assert.equal(combo.worker.hp, 90); assert.equal(combo.training.gap, false);
    const guardedUpper = ready(facing), x = guardedUpper.worker.x; guardedUpper.training.dummy = 'guard';
    advance(guardedUpper, dt, { attackPressed: 'upper' }); advance(guardedUpper, .6);
    assert.equal(guardedUpper.worker.hp, 120); assert.equal(guardedUpper.worker.y, 0); assert.ok(Math.abs(guardedUpper.worker.x - x) < 20);
  }
});

test('immediate second-hand confirms still contact after the victim invulnerability at different frame offsets', () => {
  for (const frames of [13, 15, 18, 22]) {
    const s = ready(); s.training.dummy = 'after-hit'; advance(s, frames * dt, { light: true });
    advance(s, dt); advance(s, dt, { light: true }); advance(s, .3);
    assert.equal(s.hits, 2, `confirm frame ${frames}`); assert.equal(s.training.gap, false);
  }
});
