import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFight, copyTraining, idleInput, moves, pauseFight, resumeFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';
const dt = 1/120;
function ready(distance = 600, facing: 1 | -1 = 1, cpu = true): Fight {
  const s = createFight('street', true); s.phase = 'fighting'; s.training.dummy = cpu ? 'cpu' : 'idle';
  s.worker.x = facing === 1 ? 1100 : 500; s.player.x = s.worker.x - facing * distance;
  s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  s.brain.observedDistance = distance; s.aiWait = 0; return s;
}
function advance(s: Fight, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}
function until(s: Fight, done: () => boolean, input: Partial<Input> = {}, seconds = 4): void {
  for (let i = 0; i < Math.round(seconds / dt) && !done(); i++) stepFight(s, { ...idleInput(), ...input }, dt);
  assert.ok(done(), 'transition did not occur in bounded wait');
}
test('sustained approach and crouch provoke delayed responses; brief input does not', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(600, facing), toward = facing === 1 ? { right: true } : { left: true };
    advance(s, .05, toward); assert.equal(s.worker.action, null);
    until(s, () => s.worker.action?.kind === 'thrust', toward, 1.3);
    assert.equal(s.player.hp, 100); assert.equal(s.worker.action!.time, 0); assert.ok(s.time >= .5);
    const low = ready(330, facing); advance(low, .05, { down: true }); assert.equal(low.worker.action, null);
    until(low, () => low.worker.action?.kind === 'sweep', { down: true }, 1.6); assert.equal(low.player.hp, 100); assert.ok(low.time >= .6);
    const tap = ready(600, facing); advance(tap, .05, { down: true }); advance(tap, .6);
    assert.notEqual(tap.worker.action?.kind, 'sweep'); assert.notEqual(tap.worker.action?.kind, 'spin');
  }
});
test('waiting far provokes a stationary telegraph then a spin with locked direction', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(700, facing); advance(s, .7); assert.equal(s.worker.action, null);
    until(s, () => s.worker.action?.kind === 'spin'); assert.ok(s.time >= 1.2);
    const x = s.worker.x, direction = s.worker.facing;
    advance(s, moves.spin.windup - .05); assert.equal(s.worker.x, x); assert.equal(s.player.hp, 100);
    s.player.x = s.worker.x - direction * 180;
    advance(s, .5); assert.equal(s.worker.facing, direction); assert.ok((s.worker.x - x) * direction > 0);
  }
});
test('spin has two separated contact windows and blocks twice, never once per frame', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(200, facing, false); s.worker.action = { kind: 'spin', time: 0, connected: false };
    let blocks = 0;
    for (let i = 0; i < 300; i++) {
      stepFight(s, { ...idleInput(), block: true }, dt); blocks += s.events.filter(e => e.type === 'block').length;
    }
    assert.equal(blocks, 2); assert.equal(s.player.hp, 100); assert.equal(s.player.guard, 42); assert.equal(s.worker.action, null);
    const f = ready(200, facing, false).worker; f.action = { kind: 'spin', time: moves.spin.windup - .01, connected: false };
    assert.equal(fighterGeometry(f).hit.length, 0);
    for (const [fraction, count] of [[.15, 1], [.5, 0], [.75, 1], [1.01, 0]] as const) {
      f.action.time = moves.spin.windup + moves.spin.active * fraction;
      assert.equal(fighterGeometry(f).hit.length, count, `fraction=${fraction}`);
    }
  }
});
test('spin travel is bounded, mirrored, wall-clamped, hitstop-frozen and interruptible', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(700, facing, false); s.worker.action = { kind: 'spin', time: 0, connected: false };
    const x = s.worker.x; s.player.invulnerable = 5; s.player.y = 1000; s.player.stop = 5; advance(s, 2.5);
    assert.ok(Math.abs((s.worker.x - x) * -facing - 648) < 5);
    const wall = ready(200, facing, false); wall.worker.x = facing === 1 ? 220 : 1380; wall.player.x = facing === 1 ? 500 : 1100;
    wall.player.invulnerable = 5; wall.worker.action = { kind: 'spin', time: moves.spin.windup + .02, connected: false };
    wall.worker.facing = facing === 1 ? -1 : 1; advance(wall, 1.5); assert.equal(wall.worker.x, facing === 1 ? 215 : 1385);
  }
  const s = ready(200, 1, false); s.worker.action = { kind: 'spin', time: moves.spin.windup + .2, connected: false };
  s.worker.stop = .2; const x = s.worker.x, time = s.worker.action.time;
  advance(s, .1); assert.equal(s.worker.x, x); assert.equal(s.worker.action.time, time);
  s.worker.stop = 0; s.player.action = { kind: 'jab', time: moves.jab.windup, connected: false };
  stepFight(s, idleInput(), dt); assert.equal(s.worker.action, null);
  const after = s.worker.x; advance(s, .15); assert.ok(s.worker.x >= after);
});
test('thrust has real long reach and whiff punish; sweep respects low guard', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(420, facing, false); s.worker.action = { kind: 'thrust', time: 0, connected: false };
    advance(s, moves.thrust.windup - .02); assert.equal(s.player.hp, 100); advance(s, .1); assert.equal(s.player.hp, 86);
    const miss = ready(moves.thrust.range + 130, facing, false); miss.worker.action = { kind: 'thrust', time: 0, connected: false };
    advance(miss, moves.thrust.windup + moves.thrust.active + .02); assert.equal(miss.player.hp, 100);
    until(miss, () => Math.abs(miss.player.x - miss.worker.x) <= 300, facing === 1 ? { right: true } : { left: true });
    stepFight(miss, { ...idleInput(), attackPressed: 'jab' }, dt); advance(miss, .15);
    assert.equal(miss.worker.hp, 112); assert.equal(miss.worker.action, null);
    for (const [block, down, hp, guard] of [[false, true, 83, 100], [true, true, 100, 70], [true, false, 83, 100]] as const) {
      const low = ready(300, facing, false); low.worker.action = { kind: 'sweep', time: 0, connected: false };
      advance(low, .6, { block, down }); assert.equal(low.player.hp, hp); assert.equal(low.player.guard, guard);
    }
  }
});
test('phases defer until idle, never rewind, and pause/snapshot preserve clocks', () => {
  const s = ready(600); s.worker.action = { kind: 'thrust', time: 0, connected: false }; s.worker.hp = 80;
  advance(s, .2); assert.equal(s.brain.stage, 1); assert.equal(s.worker.action?.kind, 'thrust');
  until(s, () => s.brain.stage === 2); assert.ok(s.brain.stageTime > 0); assert.equal(s.worker.action, null);
  const frozen = structuredClone(s.brain); pauseFight(s); advance(s, 1); assert.deepEqual(s.brain, frozen);
  resumeFight(s); const copy = copyTraining(s); advance(s, 1.1); advance(copy, 1.1); assert.deepEqual(s, copy);
  s.worker.hp = 40; s.worker.action = null; s.worker.reaction = null; s.worker.stun = 0;
  stepFight(s, idleInput(), dt); assert.equal(s.brain.stage, 3); assert.ok(s.brain.stageTime > 0);
  s.worker.hp = 120; advance(s, 1.1); assert.equal(s.brain.stage, 3);
  assert.equal(createFight().brain.stage, 1); assert.equal(createFight().brain.stageTime, 0);
});
test('phase change is vulnerable; passive dummy stays passive; spin recovery allows heavy punish', () => {
  const s = ready(200); s.worker.hp = 80; stepFight(s, idleInput(), dt); assert.equal(s.brain.stage, 2);
  stepFight(s, { ...idleInput(), attackPressed: 'heavy' }, dt); advance(s, .3); assert.equal(s.worker.hp, 60); assert.equal(s.worker.action, null);
  const dummy = ready(600, 1, false); advance(dummy, 4, { down: true }); assert.equal(dummy.worker.action, null); assert.equal(dummy.worker.x, 1100);
  const recovery = ready(200, 1, false); recovery.worker.action = { kind: 'spin', time: moves.spin.windup + moves.spin.active + .01, connected: true };
  stepFight(recovery, { ...idleInput(), attackPressed: 'heavy' }, dt); advance(recovery, .2); assert.equal(recovery.worker.action?.kind, 'spin'); advance(recovery, .1); assert.equal(recovery.worker.hp, 100); assert.equal(recovery.worker.action, null);
});

test('phase-two pressure shortens pauses, fatigue lengthens them, without changing startup mid-attack', () => {
  const waits: number[] = [];
  for (const stage of [1, 2, 3] as const) {
    const s = ready(300); s.brain.stage = stage; s.worker.hp = stage === 1 ? 120 : stage === 2 ? 80 : 40;
    s.brain.decisions = 4; s.brain.timer = 99; s.brain.intent = 'attack';
    stepFight(s, idleInput(), dt); assert.equal(s.worker.action?.kind, 'poke'); waits.push(s.aiWait);
    assert.equal(s.worker.action!.time, 0);
  }
  assert.deepEqual(waits, [.32, .18, .65]);
  const hit = ready(200); hit.worker.hp = 80; stepFight(hit, idleInput(), dt);
  stepFight(hit, { ...idleInput(), attackPressed: 'jab' }, dt); advance(hit, .15);
  assert.ok(hit.worker.stun > 0); const before = hit.brain.stageTime; advance(hit, .1);
  assert.ok(hit.brain.stageTime < before, 'getting hit must not indefinitely extend the phase opening');
});

test('spin snapshot after first contact preserves per-turn contacts and the second hit really lands', () => {
  const s = ready(200, 1, false); s.worker.action = { kind: 'spin', time: 0, connected: false };
  until(s, () => s.player.hp === 84); assert.deepEqual(s.worker.action!.contacts, [0]);
  const copy = copyTraining(s); advance(s, 2); advance(copy, 2);
  assert.equal(s.player.hp, 68); assert.deepEqual(s, copy);
});

test('worker closes every idle boundary near shovel range and finishes an undefended match', () => {
  for (const facing of [1, -1] as const) for (const distance of [321, 332, 340, 345, 355, 370, 371, 440]) {
    const s = ready(distance, facing), x = s.worker.x; advance(s, 4);
    assert.ok(s.worker.x !== x || s.player.hp < 100, `idle stall facing=${facing} distance=${distance}`);
  }
  const natural = createFight(); natural.phase = 'fighting'; advance(natural, 24);
  assert.ok(['ending', 'loss'].includes(natural.phase)); assert.equal(natural.player.hp, 0);
});
