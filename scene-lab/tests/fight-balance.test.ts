import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFight, idleInput, moves, startFight, stepFight, type Attack, type Fight, type Input } from '../src/fight/model.ts';
const dt = 1/120;
function advance(s: Fight, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}
function ready(distance = 200, facing: 1 | -1 = 1, wall = false): Fight {
  const s = createFight('street', true); startFight(s); advance(s, 1.7);
  s.worker.x = wall ? facing === 1 ? 1385 : 215 : 800;
  s.player.x = s.worker.x - facing * distance; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  return s;
}
function playerAction(s: Fight): Attack | undefined { return s.player.action?.kind; }
function press(s: Fight, kind: 'jab' | 'heavy' | 'low' | 'upper', seconds: number): void {
  stepFight(s, { ...idleInput(), attackPressed: kind }, dt); advance(s, seconds - dt);
}
function until(s: Fight, done: () => boolean, input: Partial<Input> = {}, limit = 240): void {
  for (let i = 0; i < limit && !done(); i++) stepFight(s, { ...idleInput(), ...input }, dt);
  assert.ok(done(), 'combat transition did not occur within the bounded wait');
}

test('earliest repeated standalone jabs leave a blockable gap at both walls, even at tip range', () => {
  for (const facing of [1, -1] as const) for (const distance of [140, 200, 320]) {
    const s = ready(distance, facing, true); s.training.dummy = 'after-hit';
    const contacts: string[] = [];
    for (let i = 0; i < 240 && contacts.length < 3; i++) {
      stepFight(s, { ...idleInput(), ...(!s.player.action ? { attackPressed: 'jab' as const } : {}) }, dt);
      contacts.push(...s.events.filter(e => e.type === 'hit' || e.type === 'block').map(e => e.type));
    }
    assert.deepEqual(contacts, ['hit', 'block', 'block'], `facing=${facing}, distance=${distance}`);
    assert.equal(s.worker.hp, 112); assert.equal(s.hits, 1); assert.equal(s.training.gap, true);
  }
});

test('confirmed routes remain true combos across spacing, orientation and wall boundaries', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) {
    for (const distance of [140, 200, 280, 320]) {
      const s = ready(distance, facing, wall); s.training.dummy = 'after-hit';
      press(s, 'jab', .13); press(s, 'heavy', .31); press(s, 'upper', .35);
      assert.equal(s.worker.hp, 78, `jab route: facing=${facing}, wall=${wall}, distance=${distance}`);
      assert.equal(s.combo, 3); assert.equal(s.training.gap, false); assert.ok(s.worker.y > 0);
    }
    for (const distance of [140, 200, 235]) {
      const s = ready(distance, facing, wall); s.training.dummy = 'after-hit';
      press(s, 'low', .22); press(s, 'upper', .35);
      assert.equal(s.worker.hp, 90, `low route: facing=${facing}, wall=${wall}, distance=${distance}`);
      assert.equal(s.combo, 2); assert.equal(s.training.gap, false);
    }
  }
});

test('heavy and low recover sooner after a whiff, with an actual follow-up input available', () => {
  for (const [kind, before, after] of [['heavy', .60, .68], ['low', .47, .55]] as const) {
    const s = ready(500); press(s, kind, before);
    assert.equal(s.player.action?.kind, kind); assert.equal(s.worker.hp, 120);
    advance(s, after - before); assert.equal(s.player.action, null);
    press(s, 'jab', .02); assert.equal(playerAction(s), 'jab'); assert.equal(s.worker.hp, 120);
  }
});

test('worker attacks retain distinct telegraphs and bounded recovery after actual contact', () => {
  for (const [kind, earliest, latest, end] of [
    ['poke', .275, .325, .80], ['sweep', .475, .525, 1.20], ['overhead', .575, .625, 1.35],
  ] as const) {
    const s = ready(); s.worker.action = { kind, time: 0, connected: false };
    let contactTime = -1;
    for (let i = 1; i <= Math.round(end / dt); i++) {
      stepFight(s, idleInput(), dt);
      if (s.events.some(e => e.type === 'hit' && e.target === 'player')) contactTime = i * dt;
    }
    assert.ok(contactTime >= earliest && contactTime <= latest, `${kind} contact at ${contactTime}`);
    assert.ok(s.player.hp < 100); assert.equal(s.worker.action, null, `${kind} recovery exceeds ${end}s`);
  }
});

function blocked(s: Fight, kind: Attack): void {
  s.worker.action = { kind, time: 0, connected: false };
  const guard = { block: true, down: kind === 'sweep' };
  until(s, () => s.blocked === 1, guard);
  assert.equal(s.player.hp, 100);
  until(s, () => s.player.stun === 0 && s.player.stop === 0, guard);
}

function punish(s: Fight, kind: 'jab' | 'heavy'): void {
  let hit = false;
  for (let i = 0; i < 45 && !hit; i++) {
    const a = s.worker.action;
    const remaining = a ? moves[a.kind].windup + moves[a.kind].active + moves[a.kind].recovery - a.time : 0;
    const recovering = !!a && a.time >= moves[a.kind].windup + moves[a.kind].active;
    stepFight(s, { ...idleInput(), ...(i === 0 ? { attackPressed: kind } : {}) }, dt);
    hit = s.events.some(e => e.type === 'hit' && e.target === 'worker');
    if (hit) assert.ok(recovering && remaining > dt, 'retaliation must connect before the worker recovers');
  }
  assert.ok(hit, 'retaliation must actually hit');
}

test('close blocks allow a heavy punish; a tip-range poke requires a step for jab retaliation', () => {
  for (const facing of [1, -1] as const) {
    for (const kind of ['poke', 'sweep', 'overhead'] as const) {
      const s = ready(200, facing); blocked(s, kind); punish(s, 'heavy');
      assert.equal(s.worker.hp, 100, `${kind} close punish, facing=${facing}`);
      assert.equal(s.player.hp, 100); assert.equal(s.worker.action, null); assert.ok(s.worker.stun > 0);
    }
    const tip = ready(320, facing); blocked(tip, 'poke'); const moment = structuredClone(tip);
    press(tip, 'jab', .15); assert.equal(tip.worker.hp, 120, 'stationary jab should miss after block pushback');
    const x = moment.player.x;
    advance(moment, .06, facing === 1 ? { right: true } : { left: true }); punish(moment, 'jab');
    assert.ok((moment.player.x - x) * facing > 10); assert.equal(moment.worker.hp, 112); assert.equal(moment.player.hp, 100);
  }
});

test('out-of-range worker swings stay harmless and can be punished during recovery in either facing', () => {
  for (const facing of [1, -1] as const) for (const kind of ['poke', 'sweep', 'overhead'] as const) {
    const s = ready(moves[kind].range + 20, facing);
    s.worker.action = { kind, time: 0, connected: false };
    advance(s, moves[kind].windup + moves[kind].active + .02);
    assert.equal(s.player.hp, 100); assert.ok(s.worker.action); assert.equal(s.worker.action.connected, false);
    until(s, () => Math.abs(s.worker.x - s.player.x) <= 300, facing === 1 ? { right: true } : { left: true });
    punish(s, 'jab');
    assert.equal(s.worker.hp, 112, `${kind} whiff punish, facing=${facing}`); assert.equal(s.player.hp, 100);
    assert.equal(s.worker.action, null); assert.ok(s.worker.stun > 0);
  }
});
