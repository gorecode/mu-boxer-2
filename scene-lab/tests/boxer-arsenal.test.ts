import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFight, idleInput, moves, pauseFight, resumeFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
const dt = 1/120;
function ready(distance = 200, facing: 1 | -1 = 1, wall = false): Fight {
  const s = createFight('street', true); s.phase = 'fighting';
  s.worker.x = wall ? facing === 1 ? 1385 : 215 : facing === 1 ? 900 : 700;
  s.player.x = s.worker.x - facing * distance; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  return s;
}
function actionKind(s: Fight) { return s.player.action?.kind; }
function advance(s: Fight, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}

test('long straight has harmless startup, bounded physical step, reach edge and one hit in both directions and walls', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) {
    for (const [distance, hp] of [[220, 106], [350, 106], [448, 106], [449, 120]] as const) {
      const s = ready(distance, facing, wall), x = s.player.x;
      advance(s, .18, { long: true }); assert.equal(s.worker.hp, 120); assert.equal(s.player.action?.kind, 'long');
      assert.ok(Math.abs((s.player.x - x) * facing - (distance === 220 ? 0 : 110)) < .001);
      advance(s, .7, { long: true }); assert.equal(s.worker.hp, hp); assert.equal(s.player.action, null);
      assert.equal(s.hits, hp === 120 ? 0 : 1);
    }
  }
});

test('step stops on interruption, freezes on pause/hitstop and does not chase a moving target', () => {
  const s = ready(400); stepFight(s, { ...idleInput(), long: true }, dt); advance(s, .04);
  const x = s.player.x; pauseFight(s); advance(s, .5); assert.equal(s.player.x, x);
  resumeFight(s); s.player.stop = .1; advance(s, .05); assert.equal(s.player.x, x);
  advance(s, .3); assert.equal(s.worker.hp, 106);
  const interrupted = ready(200); stepFight(interrupted, { ...idleInput(), long: true }, dt);
  interrupted.worker.action = { kind: 'sweep', time: moves.sweep.windup, connected: false };
  stepFight(interrupted, idleInput(), dt); assert.equal(interrupted.player.action, null);
  const after = interrupted.player.x; advance(interrupted, .2); assert.ok(interrupted.player.x <= after); assert.equal(interrupted.worker.hp, 120);
  const moving = ready(400), initial = moving.player.x; stepFight(moving, { ...idleInput(), long: true }, dt); moving.worker.x += 120;
  advance(moving, .8); assert.ok(Math.abs(moving.player.x - initial - 110) < .001); assert.equal(moving.worker.hp, 120);
});

test('overhand beats crouching guard, standing guard preserves HP, and backfist can be ducked', () => {
  for (const facing of [1, -1] as const) {
    for (const [crouch, blocking, hp, guard] of [[true, true, 98, 100], [false, true, 120, 65], [true, false, 98, 100]] as const) {
      const s = ready(200, facing); Object.assign(s.worker, { crouch, blocking, stop: 5 });
      advance(s, .35, { overhand: true }); assert.equal(s.worker.hp, 120);
      advance(s, .2, { overhand: true }); assert.equal(s.worker.hp, hp); assert.equal(s.worker.guard, guard);
      if (hp < 120) assert.equal(s.worker.reaction, 'down');
    }
    const duck = ready(200, facing); Object.assign(duck.worker, { crouch: true, stop: 5 });
    advance(duck, .8, { backfist: true }); assert.equal(duck.worker.hp, 120);
    const hit = ready(300, facing); advance(hit, .18, { backfist: true }); assert.equal(hit.worker.hp, 120);
    advance(hit, .2, { backfist: true }); assert.equal(hit.worker.hp, 102); assert.ok(hit.worker.knockback * facing > 200);
    advance(hit, .6, { backfist: true }); assert.equal(hit.worker.hp, 102); assert.equal(hit.hits, 1);
    const miss = ready(311, facing); advance(miss, .8, { backfist: true }); assert.equal(miss.worker.hp, 120);
  }
});

test('all new moves stay grounded, respect blocking, expire from long stun and require a fresh press', () => {
  for (const kind of ['long', 'overhand', 'backfist'] as const) {
    const air = ready(); air.player.y = 100; air.player.vy = 200; const x = air.player.x;
    advance(air, .2, { [kind]: true }); assert.equal(air.player.action, null); assert.equal(air.player.x, x); assert.equal(air.worker.hp, 120);
    const blocked = ready(); advance(blocked, .2, { [kind]: true, block: true }); assert.equal(blocked.player.action, null);
    const stunned = ready(); stunned.player.stun = .5; advance(stunned, .8, { [kind]: true }); assert.equal(stunned.player.action, null);
    const held = ready(); advance(held, 1.2, { [kind]: true }); assert.equal(held.hits, 1); assert.equal(held.player.action, null);
    stepFight(held, idleInput(), dt); held.worker.x = held.player.x + 200;
    stepFight(held, { ...idleInput(), [kind]: true }, dt); assert.equal(actionKind(held), kind);
  }
});

test('new ground commands buffer just before landing and pause clears them', () => {
  for (const kind of ['long', 'overhand', 'backfist'] as const) {
    const s = ready(); s.player.y = 3; s.player.vy = -100;
    stepFight(s, { ...idleInput(), attackPressed: kind }, dt); advance(s, .05); assert.equal(s.player.action?.kind, kind); assert.equal(s.player.y, 0);
    const paused = ready(); paused.player.stun = .05;
    stepFight(paused, { ...idleInput(), attackPressed: kind }, dt); pauseFight(paused); resumeFight(paused); advance(paused, .2);
    assert.equal(paused.player.action, null); assert.equal(paused.buffered, null);
  }
});

test('corner long-heavy-upper and jab-backfist are hit-confirmed branches with scaling, no cancel on block or whiff', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(430, facing, true); s.training.dummy = 'after-hit';
    stepFight(s, { ...idleInput(), attackPressed: 'long' }, dt); advance(s, .24);
    assert.equal(s.hits, 1); stepFight(s, { ...idleInput(), attackPressed: 'heavy' }, dt); advance(s, .34);
    assert.equal(s.hits, 2); stepFight(s, { ...idleInput(), attackPressed: 'upper' }, dt); advance(s, .35);
    assert.equal(s.hits, 3); assert.equal(s.worker.hp, 72); assert.equal(s.training.gap, false);
    const branch = ready(300, facing); branch.training.dummy = 'after-hit'; advance(branch, .13, { light: true });
    stepFight(branch, { ...idleInput(), backfist: true }, dt); advance(branch, .33);
    assert.equal(branch.hits, 2); assert.equal(branch.worker.hp, 96); assert.equal(branch.training.gap, false);
  }
  for (const dummy of ['idle', 'guard'] as const) {
    const s = ready(dummy === 'idle' ? 600 : 200); s.training.dummy = dummy;
    advance(s, .27, { long: true }); stepFight(s, { ...idleInput(), attackPressed: 'heavy' }, dt); advance(s, .15);
    assert.equal(s.player.action?.kind, 'long'); assert.equal(s.worker.hp, 120);
  }
});
