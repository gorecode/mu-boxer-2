import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fighterGeometry, overlaps } from '../src/fight/geometry.ts';
import { createFight, idleInput, moves, pauseFight, resumeFight, startFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
const dt = 1/120;
function advance(s: Fight, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}
function ready(distance = 300, facing: 1 | -1 = 1, wall = false): Fight {
  const s = createFight('street', true); startFight(s); advance(s, 1.7);
  s.worker.x = wall ? facing === 1 ? 1385 : 215 : facing === 1 ? 900 : 700;
  s.player.x = s.worker.x - facing * distance; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  return s;
}

test('standalone uppercut steps into normal fighting distance before contact in either facing and at walls', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) for (const distance of [280, 300, 320]) {
    const s = ready(distance, facing, wall), x = s.player.x;
    stepFight(s, { ...idleInput(), down: true, heavy: true }, dt); advance(s, .15, { down: true });
    assert.equal(s.player.action?.kind, 'upper'); assert.equal(s.worker.hp, 120, 'startup must remain harmless');
    const travel = (s.player.x - x) * facing;
    assert.ok(travel >= 49.99 && travel <= 70.001, `step=${travel}, distance=${distance}`);
    advance(s, .2); assert.equal(s.worker.hp, 97); assert.ok(s.worker.y > 0); assert.equal(s.hits, 1);
    advance(s, .6); assert.equal(s.worker.hp, 97); assert.equal(s.hits, 1);
  }
});

test('uppercut keeps a bounded step and real contact range without close-range creep or chasing', () => {
  for (const facing of [1, -1] as const) {
    for (const distance of [140, 200, 230]) {
      const s = ready(distance, facing), x = s.player.x;
      stepFight(s, { ...idleInput(), attackPressed: 'upper' }, dt); advance(s, .15);
      assert.equal(s.player.x, x); advance(s, .2); assert.equal(s.worker.hp, 97);
    }
    for (const distance of [321, 400, 600]) {
      const s = ready(distance, facing), x = s.player.x;
      stepFight(s, { ...idleInput(), attackPressed: 'upper' }, dt); advance(s, .8);
      assert.ok(Math.abs((s.player.x - x) * facing - 70) < .001); assert.equal(s.worker.hp, 120); assert.equal(s.hits, 0);
    }
    const moving = ready(300, facing), x = moving.player.x;
    stepFight(moving, { ...idleInput(), attackPressed: 'upper' }, dt); moving.worker.x += facing * 120;
    advance(moving, .8); assert.ok(Math.abs((moving.player.x - x) * facing - 70) < .001); assert.equal(moving.worker.hp, 120);
  }
});

test('uppercut step pauses, stops on interruption and never gives an airborne punch a ground dash', () => {
  const s = ready(); stepFight(s, { ...idleInput(), attackPressed: 'upper' }, dt); advance(s, .04);
  const x = s.player.x; assert.ok(x > 600); pauseFight(s); advance(s, .5); assert.equal(s.player.x, x);
  resumeFight(s); advance(s, .4); assert.equal(s.worker.hp, 97);
  const interrupted = ready(200); stepFight(interrupted, { ...idleInput(), attackPressed: 'upper' }, dt);
  interrupted.worker.action = { kind: 'sweep', time: moves.sweep.windup, connected: false };
  stepFight(interrupted, idleInput(), dt); assert.equal(interrupted.player.action, null); assert.equal(interrupted.player.hp, 83);
  const before = interrupted.player.x; advance(interrupted, .15); assert.ok(interrupted.player.x <= before); assert.equal(interrupted.worker.hp, 120);
  const air = ready(); air.player.y = 80; air.player.vy = 300;
  const airX = air.player.x; stepFight(air, { ...idleInput(), attackPressed: 'upper' }, dt); advance(air, .15);
  assert.equal(air.player.x, airX); assert.ok(air.player.y > 0);
  const rear = ready(); rear.player.facing = -1; const rearX = rear.player.x;
  stepFight(rear, { ...idleInput(), attackPressed: 'upper' }, dt); advance(rear, .4);
  assert.equal(rear.player.x, rearX); assert.equal(rear.worker.hp, 120);
});

test('low guard keeps its crouched posture and geometry through block hitstop and recovery, then releases', () => {
  const s = ready(200); s.worker.action = { kind: 'sweep', time: moves.sweep.windup, connected: false };
  const guard = { block: true, down: true };
  stepFight(s, { ...idleInput(), ...guard }, dt); assert.equal(s.player.reaction, 'guard'); assert.equal(s.player.crouch, true);
  advance(s, .06, guard); assert.equal(s.player.reaction, 'guard'); assert.equal(s.player.crouch, true);
  assert.equal(fighterGeometry(s.player).hurt.at(-1)?.top, 265); assert.equal(s.player.hp, 100); assert.equal(s.player.guard, 70);
  advance(s, .2, guard); assert.equal(s.player.blocking, true); assert.equal(s.player.crouch, true);
  stepFight(s, idleInput(), dt); assert.equal(s.player.blocking, false); assert.equal(s.player.crouch, false);
});

test('contact edges tolerate floating point movement noise without bridging a real gap', () => {
  const a = { left: 0, bottom: 0, right: 10, top: 10 };
  for (const noise of [0, 3e-13, -3e-13]) {
    const edge = { left: 10 + noise, bottom: 10 + noise, right: 20, top: 20 };
    assert.equal(overlaps(a, edge), true); assert.equal(overlaps(edge, a), true);
  }
  for (const gap of [.000001, .1, 1]) {
    const outside = { left: 10 + gap, bottom: 0, right: 20, top: 10 };
    assert.equal(overlaps(a, outside), false); assert.equal(overlaps(outside, a), false);
  }
});
