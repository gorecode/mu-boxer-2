import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyTraining, createFight, idleInput, moves, pauseFight, resumeFight, startFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
const dt = 1/120;
function advance(s: Fight, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}
function ready(): Fight {
  const s = createFight(); startFight(s); advance(s, 1.7); s.aiWait = 999; s.brain.timer = 999;
  s.player.x = 600; s.worker.x = 800; return s;
}
function until(s: Fight, done: () => boolean, input: Partial<Input> = {}): void {
  for (let i = 0; i < 600 && !done(); i++) stepFight(s, { ...idleInput(), ...input }, dt);
  assert.ok(done(), 'ending transition did not occur within five seconds');
}
function knockout(s: Fight): number {
  s.worker.hp = 8; stepFight(s, { ...idleInput(), attackPressed: 'jab' }, dt);
  let before = s.worker.y;
  for (let i = 0; i < 600 && s.phase === 'fighting'; i++) { before = s.worker.y; stepFight(s, idleInput(), dt); }
  assert.equal(s.phase, 'ending'); return before;
}

test('lethal contact preserves hitstop and attack, then falls, holds KO, fades and reveals the frozen result', () => {
  const s = ready(); knockout(s);
  assert.equal(s.ending?.stage, 'fall'); assert.equal(s.ending?.result, 'win'); assert.equal(s.ending?.reason, 'ko');
  assert.equal(s.player.action?.kind, 'jab'); assert.ok(s.worker.y > 0); assert.ok(s.worker.vy >= 420); assert.ok(s.worker.stop > 0);
  assert.equal(s.events.some(e => e.type === 'finish'), false);
  const y = s.worker.y, x = s.player.x, remaining = s.remaining, time = s.time, hits = s.hits;
  advance(s, .02, { right: true, heavy: true }); assert.equal(s.worker.y, y); assert.equal(s.ending?.elapsed, 0);
  let landed = 0, finished = 0, apex = 0;
  for (let i = 0; i < 240 && s.ending?.stage === 'fall'; i++) {
    stepFight(s, { ...idleInput(), right: true, heavy: true }, dt);
    apex = Math.max(apex, s.worker.y);
    landed += s.events.filter(e => e.type === 'land' && e.target === 'worker').length;
    finished += s.events.filter(e => e.type === 'finish').length;
  }
  assert.ok(apex > 35); assert.equal(landed, 1); assert.equal(finished, 1);
  assert.equal(s.worker.y, 0); assert.equal(s.ending?.stage, 'ko'); assert.equal(s.phase, 'ending');
  assert.equal(s.player.hp, 100); assert.equal(s.player.x, x); assert.equal(s.hits, hits); assert.equal(s.remaining, remaining); assert.equal(s.time, time);
  advance(s, 1.09); assert.equal(s.ending?.stage, 'ko');
  advance(s, dt); assert.equal(s.ending?.stage, 'fade'); assert.equal(s.phase, 'ending');
  advance(s, .54); assert.equal(s.phase, 'ending'); advance(s, dt); assert.equal(s.phase, 'win');
  stepFight(s, idleInput(), 0); const terminal = JSON.stringify(s);
  advance(s, 2, { jump: true, heavy: true, left: true }); assert.equal(JSON.stringify(s), terminal);
});

test('ground, airborne and uppercut knockouts land naturally in either facing and at walls', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) for (const airborne of [false, true]) {
    const s = ready(); s.worker.x = wall ? facing === 1 ? 1385 : 215 : 800;
    s.player.x = s.worker.x - facing * 200; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
    if (airborne) { s.worker.y = 80; s.worker.vy = -120; s.player.y = 40; s.player.vy = 200; }
    const before = knockout(s); assert.ok(s.worker.y >= before - 5);
    until(s, () => s.ending?.stage === 'ko');
    assert.equal(s.player.y, 0); assert.equal(s.worker.y, 0); assert.equal(s.worker.vy, 0);
    assert.ok(s.worker.x >= 215 && s.worker.x <= 1385); until(s, () => s.phase === 'win');
  }
  const upper = ready(); upper.worker.hp = 23;
  stepFight(upper, { ...idleInput(), attackPressed: 'upper' }, dt); until(upper, () => upper.phase === 'ending');
  assert.ok(upper.worker.vy >= 620); assert.ok(upper.worker.y > 0); until(upper, () => upper.ending?.stage === 'ko');
  assert.equal(upper.worker.y, 0);
});

test('loss and double knockout follow the same sequence without additional damage or AI attacks', () => {
  const loss = ready(); loss.player.hp = 12; loss.worker.action = { kind: 'poke', time: moves.poke.windup - .005, connected: false };
  stepFight(loss, idleInput(), dt); assert.equal(loss.phase, 'ending'); assert.equal(loss.ending?.result, 'loss');
  assert.equal(loss.player.hp, 0); assert.ok(loss.player.y > 0); const enemyHp = loss.worker.hp;
  until(loss, () => loss.phase === 'loss', { light: true, right: true, jump: true }); assert.equal(loss.worker.hp, enemyHp);
  const draw = ready();
  for (const f of [draw.player, draw.worker]) { f.hp = 8; f.action = { kind: 'jab', time: .11, connected: false }; }
  stepFight(draw, idleInput(), dt); assert.equal(draw.phase, 'ending'); assert.equal(draw.ending?.result, 'draw');
  assert.equal(draw.player.hp, 0); assert.equal(draw.worker.hp, 0); assert.ok(draw.player.vy > 0 && draw.worker.vy > 0);
  until(draw, () => draw.ending?.stage === 'ko'); assert.equal(draw.player.y, 0); assert.equal(draw.worker.y, 0);
  until(draw, () => draw.phase === 'draw');
});

test('timeout keeps health-fraction outcomes without manufacturing a knockout, and training never ends', () => {
  for (const [hp, enemyHp, result] of [[80, 60, 'win'], [40, 96, 'loss'], [50, 60, 'draw']] as const) {
    const s = ready(); s.player.hp = hp; s.worker.hp = enemyHp; s.remaining = .001;
    stepFight(s, idleInput(), dt); assert.equal(s.phase, 'ending'); assert.equal(s.ending?.reason, 'time'); assert.equal(s.ending?.result, result);
    assert.equal(s.player.y, 0); assert.equal(s.worker.y, 0); assert.equal(s.player.vy, 0); assert.equal(s.worker.vy, 0);
    until(s, () => s.phase === result); assert.equal(s.player.hp, hp); assert.equal(s.worker.hp, enemyHp);
  }
  const train = ready(); train.training.enabled = true; train.worker.hp = 1; train.remaining = .001;
  advance(train, .8, { light: true }); assert.equal(train.phase, 'fighting'); assert.equal(train.ending, null); assert.equal(train.worker.hp, 1);
});

test('every ending stage pauses exactly, rejects snapshots and invalid steps, and a fresh fight drops the sequence', () => {
  for (const stage of ['fall', 'ko', 'fade'] as const) {
    const s = ready(); knockout(s); until(s, () => s.ending?.stage === stage);
    assert.throws(() => copyTraining(s), /активной тренировке/);
    for (const bad of [NaN, -.01, .051]) assert.throws(() => stepFight(s, idleInput(), bad), RangeError);
    stepFight(s, idleInput(), 0); pauseFight(s); assert.equal(s.phase, 'paused'); assert.equal(s.resume, 'ending');
    const frozen = JSON.stringify(s); advance(s, 2, { light: true }); assert.equal(JSON.stringify(s), frozen);
    resumeFight(s); assert.equal(s.phase, 'ending'); const before = s.ending!.elapsed;
    advance(s, .2); assert.ok(s.ending!.elapsed > before);
    const fresh = createFight(); assert.equal(fresh.ending, null); assert.equal(fresh.phase, 'menu'); assert.equal(fresh.worker.hp, 120);
  }
});
