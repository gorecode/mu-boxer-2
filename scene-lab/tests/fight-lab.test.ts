import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyTraining, createFight, idleInput, moves, startFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
import { celAt, editCel, resetCels } from '../src/fight/moves.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';
const advance = (s: Fight, seconds: number, input: Partial<Input> = {}) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) stepFight(s, { ...idleInput(), ...input }, 1/120);
};
function ready(): Fight { const s = createFight('street', true); startFight(s); advance(s, 1.7); s.player.x = 600; s.worker.x = 800; return s; }
function poke(s: Fight) { s.worker.action = { kind: 'poke', time: moves.poke.windup - .005, connected: false }; }

test('cel duration, pose and collision share one source, including active boundaries and reset', () => {
  const s = ready();
  try {
    editCel('jab', 0, { duration: .2, pose: 7 });
    assert.equal(moves.jab.windup, .2); assert.equal(celAt('jab', .199).cel.pose, 7);
    assert.equal(celAt('jab', .2).cel.phase, 'active');
    editCel('jab', 1, { hit: [{ left: 60, right: 300, bottom: 420, top: 510 }] });
    assert.equal(moves.jab.range, 365);
    s.player.action = { kind: 'jab', time: .199, connected: false };
    assert.equal(fighterGeometry(s.player).hit.length, 0);
    s.player.action.time = .2;
    assert.deepEqual(fighterGeometry(s.player).hit[0], { left: 660, right: 900, bottom: 420, top: 510 });
    s.player.facing = -1; s.player.y = 50;
    assert.deepEqual(fighterGeometry(s.player).hit[0], { left: 300, right: 540, bottom: 470, top: 560 });
    s.player.action.time = .29; assert.equal(fighterGeometry(s.player).hit.length, 0);
  } finally { resetCels(); }
  assert.equal(moves.jab.windup, .1); assert.equal(moves.jab.cels[0].pose, 0);
  assert.equal(moves.jab.cels[1].hit[0].right, 255); assert.equal(moves.jab.range, 320);
});

test('editor rejects invalid duration, pose, phase and rectangles atomically', () => {
  const before = JSON.stringify(moves.jab.cels);
  for (const duration of [NaN, Infinity, 0, 1/121, 2.01]) assert.throws(() => editCel('jab', 0, { duration, pose: 2 }), RangeError);
  for (const pose of [-1, 12, .5, NaN]) assert.throws(() => editCel('jab', 1, { pose }), RangeError);
  assert.throws(() => editCel('jab', 7, { pose: 0 }), RangeError);
  for (const b of [{ left: 20, right: 10, bottom: 0, top: 10 }, { left: -601, right: 10, bottom: 0, top: 10 }, { left: 0, right: 10, bottom: 20, top: 10 }, { left: 0, right: 10, bottom: 0, top: 801 }]) assert.throws(() => editCel('jab', 1, { hit: [b] }), RangeError);
  assert.throws(() => editCel('jab', 0, { hit: [] }), RangeError);
  assert.equal(JSON.stringify(moves.jab.cels), before);
});

test('training has no timeout or knockout and dummy guard modes detect a real gap', () => {
  const s = ready(); s.remaining = .01; s.worker.hp = 1;
  advance(s, .16, { light: true }); assert.equal(s.phase, 'fighting'); assert.equal(s.worker.hp, 1); assert.equal(s.remaining, .01);
  const block = ready(); block.training.dummy = 'guard';
  advance(block, .16, { light: true }); assert.equal(block.worker.hp, 120); assert.equal(block.player.action?.result, 'block');
  const gap = ready(); gap.training.dummy = 'after-hit';
  advance(gap, .13, { light: true }); assert.equal(gap.worker.hp, 112); assert.equal(gap.training.firstHit, true); assert.equal(gap.training.gap, false);
  advance(gap, .8); gap.worker.x = gap.player.x + 200;
  advance(gap, .16, { light: true }); assert.equal(gap.worker.hp, 112); assert.equal(gap.training.gap, true);
  const low = ready(); low.training.dummy = 'after-hit';
  advance(low, .13, { light: true }); advance(low, .8); low.worker.x = low.player.x + 200;
  advance(low, .22, { down: true, light: true });
  assert.equal(low.worker.hp, 112); assert.equal(low.player.action?.result, 'block'); assert.equal(low.training.gap, true);
});

test('confirmed chains chase within a bounded distance at max jab range, mirrored and at walls', () => {
  for (const [x, facing] of [[600, 1], [900, -1], [1065, 1], [535, -1]] as const) {
    const s = ready(); s.training.dummy = 'after-hit'; s.player.x = x; s.worker.x = x + facing * 320;
    s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
    advance(s, .12, { light: true }); assert.equal(s.hits, 1);
    advance(s, .02, { heavy: true }); advance(s, .29); assert.equal(s.hits, 2);
    assert.ok((s.player.action?.lunge ?? 0) <= 120);
    advance(s, .02, { down: true, heavy: true }); advance(s, .34);
    assert.equal(s.hits, 3); assert.equal(s.worker.hp, 78); assert.equal(s.training.gap, false);
    assert.ok(Math.abs(s.player.x - x) <= 240); assert.ok(Math.abs(s.player.x - s.worker.x) >= 140);
  }
});

test('guard cooldown resets on contact, holds steady during block and regenerates only after rest', () => {
  const s = ready(); poke(s); advance(s, .04, { block: true });
  assert.equal(s.player.guard, 75); assert.ok(s.player.guardDelay > .6);
  advance(s, .2, { block: true }); assert.equal(s.player.guard, 75);
  advance(s, .4); assert.equal(s.player.guard, 75);
  advance(s, .12); assert.ok(s.player.guard > 75);
  poke(s); advance(s, .04, { block: true }); const guard = s.player.guard;
  assert.ok(s.player.guardDelay > .6); advance(s, .5); assert.equal(s.player.guard, guard);
});

test('backdash retreats in either facing with brief immunity, cooldown and ground-only activation', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(); s.player.facing = facing; s.worker.x = s.player.x + facing * 200; poke(s);
    advance(s, .04, { dodge: true }); assert.equal(s.player.hp, 100); assert.ok(s.player.dodge > 0);
    s.worker.action = null; advance(s, .07);
    assert.ok((s.player.x - 600) * facing < -30); assert.equal(s.player.invulnerable, 0);
    poke(s); advance(s, .02); assert.equal(s.player.hp, 88);
  }
  const s = ready(); advance(s, .2, { dodge: true }); assert.equal(s.player.dodge, 0);
  advance(s, .01); advance(s, .02, { dodge: true }); assert.equal(s.player.dodge, 0);
  advance(s, .6); advance(s, .02, { dodge: true }); assert.ok(s.player.dodge > 0);
  const air = ready(); air.player.y = 100; air.player.vy = 100; advance(air, .02, { dodge: true }); assert.equal(air.player.dodge, 0);
  const wall = ready(); wall.player.x = 215; wall.worker.x = 500; advance(wall, .2, { dodge: true }); assert.equal(wall.player.x, 215);
});

test('CPU acts on a previous observation rather than the current attack and stays deterministic', () => {
  const s = ready(); s.training.enabled = false; s.aiWait = 999; s.brain.timer = .18; s.brain.observedDistance = 200; s.worker.invulnerable = 99;
  advance(s, .2, { heavy: true }); assert.equal(s.brain.observedAttack, 'heavy'); assert.equal(s.worker.blocking, false);
  const copy = structuredClone(s);
  advance(s, .18); advance(copy, .18); assert.equal(s.worker.blocking, true); assert.deepEqual(s, copy);
  assert.equal(s.brain.intent, 'guard');
  const mistake = ready(); mistake.training.enabled = false; mistake.aiWait = 999; mistake.worker.invulnerable = 99;
  Object.assign(mistake.brain, { timer: 0, decisions: 6, observedDistance: 200, observedAttack: 'heavy', recovering: false });
  mistake.player.action = { kind: 'heavy', time: .1, connected: false };
  stepFight(mistake, idleInput(), 1/120); assert.equal(mistake.brain.intent, 'attack');
  mistake.brain.timer = 0; stepFight(mistake, idleInput(), 1/120); assert.equal(mistake.brain.intent, 'guard');
  assert.equal(createFight('warmup').brain.timer, .32); assert.equal(createFight().brain.timer, .18);
});

test('training snapshots detach state, restore deterministic combat and discard held/queued input', () => {
  const s = ready(); advance(s, .12, { light: true }); s.held.heavy = true; s.buffered = { kind: 'upper', remaining: .12 };
  const saved = copyTraining(s); assert.equal(saved.buffered, null); assert.deepEqual(saved.held, idleInput()); assert.deepEqual(saved.events, []);
  assert.equal(saved.worker.hp, 112); assert.equal(saved.player.action?.kind, 'jab'); assert.equal(saved.brain.timer, s.brain.timer);
  s.player.x = 900; assert.equal(saved.player.x, 600);
  const a = copyTraining(saved), b = copyTraining(saved); advance(a, .5); advance(b, .5); assert.deepEqual(a, b);
  a.worker.hp = 1; assert.equal(saved.worker.hp, 112);
  assert.throws(() => copyTraining(createFight()), /активной тренировке/);
  assert.throws(() => copyTraining(createFight('street', true)), /активной тренировке/);
});
