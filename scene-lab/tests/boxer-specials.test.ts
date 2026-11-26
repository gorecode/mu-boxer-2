import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandState, lightCommand, observeDirections } from '../src/fight/commands.ts';
import { createFight, copyTraining, idleInput, pauseFight, resumeFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
import { celAt, editCel, moves, resetCels, strikeAt } from '../src/fight/moves.ts';
import { fighterGeometry, overlaps } from '../src/fight/geometry.ts';
import { boxerPose, crossFrame, jabFrame, walkFrame } from '../src/fight/boxer-animation.ts';

const dt = 1 / 120;
function ready(distance = 320, facing: 1 | -1 = 1, wall = false) {
  const s = createFight('street', true); s.phase = 'fighting';
  s.worker.x = wall ? facing === 1 ? 1385 : 215 : facing === 1 ? 1000 : 600;
  s.player.x = s.worker.x - facing * distance; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  return s;
}
function advance(s: Fight, seconds: number, input: Partial<Input> = {}) {
  const events: Fight['events'] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) { stepFight(s, { ...idleInput(), ...input }, dt); events.push(...s.events); }
  return events;
}
function command(s: Fight, kind: 'ram' | 'counter') {
  const toward = kind === 'ram' ? s.player.facing : -s.player.facing;
  const direction = toward === 1 ? 'right' : 'left';
  advance(s, .025, { [direction]: true }); advance(s, .025);
  advance(s, .025, { [s.player.facing === 1 ? 'right' : 'left']: true }); advance(s, .025);
  advance(s, dt, { light: true });
  assert.equal(s.player.action?.kind, kind);
}

test('forward-forward and back-forward light commands mirror, accept release, expire and consume once', () => {
  for (const facing of [1, -1] as const) for (const kind of ['ram', 'counter'] as const) {
    const state = commandState(), direction = (kind === 'ram' ? facing : -facing) === 1 ? 'right' : 'left';
    const held = { ...idleInput(), [direction]: true };
    observeDirections(state, held, facing, 0); observeDirections(state, held, facing, .1);
    assert.equal(lightCommand(state, held, facing, .1), 'light');
    observeDirections(state, idleInput(), facing, .12);
    observeDirections(state, { ...idleInput(), [facing === 1 ? 'right' : 'left']: true }, facing, .28);
    observeDirections(state, idleInput(), facing, .30);
    const saved = structuredClone(state);
    assert.equal(lightCommand(state, idleInput(), facing, .53), kind);
    assert.equal(lightCommand(state, idleInput(), facing, .54), 'light');
    assert.equal(lightCommand(saved, idleInput(), facing, .53001), 'light');
    assert.equal(lightCommand(saved, { ...held, down: true }, facing, .3), 'low');
    assert.equal(lightCommand(saved, held, facing, .3, false), 'light');
    assert.equal(lightCommand(saved, { ...held, left: true, right: true }, facing, .3), 'light');
    observeDirections(saved, { ...idleInput(), block: true }, facing, .3);
    assert.equal(lightCommand(saved, idleInput(), facing, .31), 'light');
    observeDirections(state, held, -facing, .55); assert.equal(state.backForward, -Infinity); assert.equal(state.forwardDouble, -Infinity);
  }
});

test('counter requires back then forward: no old back-back binding, late sequence, stale repeat or conflicting input', () => {
  for (const facing of [1, -1] as const) {
    const back = { ...idleInput(), [facing === 1 ? 'left' : 'right']: true };
    const forward = { ...idleInput(), [facing === 1 ? 'right' : 'left']: true };
    const state = commandState();
    observeDirections(state, back, facing, 0); observeDirections(state, idleInput(), facing, .05);
    observeDirections(state, back, facing, .1); observeDirections(state, idleInput(), facing, .15);
    assert.equal(lightCommand(state, idleInput(), facing, .15), 'light');
    observeDirections(state, forward, facing, .2);
    assert.equal(lightCommand(state, forward, facing, .2), 'counter');
    assert.equal(lightCommand(state, forward, facing, .21), 'light');
    observeDirections(state, idleInput(), facing, .25); observeDirections(state, forward, facing, .3);
    assert.equal(lightCommand(state, forward, facing, .3), 'light');
    const late = commandState(); observeDirections(late, back, facing, 0);
    observeDirections(late, idleInput(), facing, .1); observeDirections(late, forward, facing, .280001);
    assert.equal(lightCommand(late, forward, facing, .3), 'light');
    for (const conflict of [{ block: true }, { down: true }, { up: true }, { left: true, right: true }]) {
      const interrupted = commandState(); observeDirections(interrupted, back, facing, 0);
      observeDirections(interrupted, { ...idleInput(), ...conflict }, facing, .05);
      observeDirections(interrupted, forward, facing, .1);
      assert.equal(lightCommand(interrupted, forward, facing, .1), 'light');
    }
  }
});

test('real direction presses invoke each two-hit special once; holding J never repeats it, both facings', () => {
  for (const facing of [1, -1] as const) for (const kind of ['ram', 'counter'] as const) {
    const s = ready(320, facing); command(s, kind);
    let down = false;
    for (let i = 0; i < 240; i++) { advance(s, dt, { light: true }); down ||= s.worker.reaction === 'down'; }
    assert.equal(s.hits, 2); assert.equal(s.worker.hp, kind === 'ram' ? 92 : 95);
    assert.equal(down, kind === 'ram'); assert.equal(s.player.action, null); assert.deepEqual(s.comboQueue, []);
  }
});

test('ram reaches beyond a standing jab and both blows land across distances and at either wall', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) for (const distance of [180, 320, 450, 550]) {
    const s = ready(distance, facing, wall); advance(s, dt, { attackPressed: 'ram' });
    const events = advance(s, 1.4).filter(e => e.type === 'hit');
    assert.equal(events.length, 2, `distance=${distance}, facing=${facing}, wall=${wall}`);
    assert.deepEqual(events.map(e => e.power), [10, 18]); assert.equal(s.worker.hp, 92);
    assert.ok(s.worker.x >= 215 && s.worker.x <= 1385); assert.ok(s.player.x >= 215 && s.player.x <= 1385);
    assert.equal(s.player.y, 0); assert.equal(s.player.vy, 0);
  }
});

test('ram whiff skips the second blow; holding guard absorbs both hits without a knockdown', () => {
  const miss = ready(650), x = miss.player.x;
  advance(miss, dt, { attackPressed: 'ram' }); advance(miss, 1.3);
  assert.equal(miss.hits, 0); assert.equal(miss.worker.hp, 120); assert.equal(miss.player.action, null);
  assert.ok(Math.abs(miss.player.x - x - 250) < 1e-6);
  for (const kind of ['ram', 'counter'] as const) for (const facing of [1, -1] as const) {
    const s = ready(280, facing); s.training.dummy = 'guard';
    advance(s, dt, { attackPressed: kind }); const events = advance(s, 1.4);
    assert.equal(s.worker.hp, 120); assert.equal(s.hits, 0);
    assert.equal(events.filter(e => e.type === 'block').length, 2);
    assert.ok(s.worker.guard < 60); assert.notEqual(s.worker.reaction, 'down'); assert.equal(s.worker.y, 0);
  }
});

test('counter takes a short grounded backstep, reverses immediately and finishes standing with brief stun', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(320, facing), x = s.player.x;
    advance(s, dt, { attackPressed: 'counter' }); advance(s, .1);
    assert.ok(Math.abs(s.player.x - (x - facing * 80)) < 1e-6); assert.equal(s.player.y, 0); assert.equal(s.player.vy, 0);
    const back = s.player.x; advance(s, dt); assert.ok((s.player.x - back) * facing > 0);
    const events = advance(s, .65).filter(e => e.type === 'hit');
    assert.deepEqual(events.map(e => e.power), [9, 16]); assert.equal(s.worker.hp, 95);
    assert.notEqual(s.worker.reaction, 'down'); assert.equal(s.worker.y, 0); assert.ok(s.worker.stun < .38);
    advance(s, .8); assert.equal(s.worker.stun, 0); assert.equal(s.worker.reaction, null);
  }
  const miss = ready(500); advance(miss, dt, { attackPressed: 'counter' }); advance(miss, 1.5); assert.equal(miss.hits, 0);
});

test('pause and hitstop freeze travel; a saved first contact resumes into just one finisher', () => {
  for (const kind of ['ram', 'counter'] as const) {
    const s = ready(280); advance(s, dt, { attackPressed: kind });
    for (let i = 0; i < 120 && s.hits === 0; i++) advance(s, dt);
    assert.equal(s.hits, 1);
    const copy = copyTraining(s), x = s.player.x, time = s.player.action!.time;
    pauseFight(s); advance(s, .4); assert.equal(s.player.x, x); assert.equal(s.player.action!.time, time); resumeFight(s);
    s.player.stop = .2; s.worker.stop = .2; s.hitstop = .2;
    advance(s, .1); assert.equal(s.player.x, x); assert.equal(s.player.action!.time, time);
    advance(copy, 1); assert.equal(copy.hits, 2); assert.equal(copy.worker.hp, kind === 'ram' ? 92 : 95);
    advance(s, 1); assert.equal(s.hits, 2); assert.equal(s.worker.hp, copy.worker.hp);
  }
});

test('incoming hits interrupt startup, and air, guard, long stun or pause cannot leak a grounded special', () => {
  for (const kind of ['ram', 'counter'] as const) {
    const hit = ready(180); advance(hit, dt, { attackPressed: kind });
    hit.worker.action = { kind: 'poke', time: moves.poke.windup, connected: false };
    advance(hit, dt); assert.equal(hit.player.hp, 88); assert.equal(hit.player.action, null);
    advance(hit, 1); assert.equal(hit.hits, 0);
    for (const unavailable of ['air', 'block', 'stun'] as const) {
      const s = ready();
      if (unavailable === 'air') { s.player.y = 200; s.player.vy = 400; }
      if (unavailable === 'stun') s.player.stun = .5;
      advance(s, dt, { attackPressed: kind, block: unavailable === 'block' });
      advance(s, .25, { block: unavailable === 'block' });
      assert.equal(s.player.action, null); advance(s, .8); assert.equal(s.player.action, null); assert.equal(s.hits, 0);
    }
    const paused = ready(); const dir = kind === 'ram' ? 'right' : 'left';
    advance(paused, .025, { [dir]: true }); advance(paused, .025); pauseFight(paused); resumeFight(paused);
    advance(paused, .025, { [dir]: true }); advance(paused, dt, { light: true }); assert.equal(paused.player.action?.kind, 'jab');
  }
});

test('two independent contact windows follow real poses, padded fists and mirrored boxes; recovery has none', () => {
  for (const kind of ['ram', 'counter'] as const) for (const facing of [1, -1] as const) {
    const f = ready().player; f.x = 700; f.facing = facing; let time = 0, strike = 0;
    for (const cel of moves[kind].cels) {
      f.action = { kind, time: time + cel.duration / 2, connected: false };
      const boxes = fighterGeometry(f);
      if (cel.phase === 'active') {
        assert.equal(strikeAt(kind, f.action.time), strike++); assert.equal(boxes.hit.length, 1);
        const tip = cel.pose === 2 ? 254.66 : cel.pose === 3 ? 227.29 : 139.23;
        assert.ok(cel.hit[0].right - tip >= 12 && cel.hit[0].right - tip <= 40);
        const edge = facing === 1 ? boxes.hit[0].right : boxes.hit[0].left;
        const target = { left: facing === 1 ? edge : edge - 10, right: facing === 1 ? edge + 10 : edge, bottom: 430, top: 450 };
        assert.equal(overlaps(boxes.hit[0], target), true);
        target.left += facing * .1; target.right += facing * .1;
        assert.equal(overlaps(boxes.hit[0], target), false);
      } else { assert.equal(boxes.hit.length, 0); assert.equal(strikeAt(kind, f.action.time), -1); }
      time += cel.duration;
    }
    assert.equal(strike, 2);
  }
  const f = ready().player; f.action = { kind: 'counter', time: .01, connected: false }; assert.equal(walkFrame(f), 3);
  f.action.time = .1; assert.equal(walkFrame(f), 0);
  f.action.time = .32; assert.equal(boxerPose(f), 3); f.action.time = .48; assert.equal(boxerPose(f), 12);
  f.action = { kind: 'ram', time: 0, connected: false }; assert.equal(jabFrame(f), 0);
  f.action.time = .42; assert.equal(crossFrame(f), 0);
});

test('ram knockdown falls, lands and recovers; neither airborne nor grounded knockdown can be hit again', () => {
  const s = ready(280); advance(s, dt, { attackPressed: 'ram' });
  for (let i = 0; i < 120 && s.hits < 2; i++) advance(s, dt);
  assert.equal(s.hits, 2); assert.equal(s.worker.reaction, 'down'); assert.ok(s.worker.vy > 0);
  const hp = s.worker.hp;
  for (const y of [50, 0]) {
    s.worker.x = s.player.x + 170; s.worker.y = y; s.worker.vy = 0; s.worker.invulnerable = 0; s.worker.stop = 0; s.worker.stun = .5;
    s.player.stop = 0; s.player.action = { kind: 'jab', time: moves.jab.windup, connected: false };
    advance(s, dt); assert.equal(s.worker.hp, hp);
  }
  s.player.action = null; advance(s, 1.2); assert.equal(s.worker.y, 0); assert.equal(s.worker.reaction, null);
});

test('multi-stage editor changes remain atomic and reset restores every stage without duplicates', () => {
  const before = structuredClone(moves.counter.cels);
  try {
    editCel('counter', 7, { duration: .2, pose: 13 }); assert.equal(moves.counter.cels[7].pose, 13);
    assert.equal(celAt('counter', .5).cel.pose, 13);
    const edited = structuredClone(moves.counter.cels);
    assert.throws(() => editCel('counter', 10, { duration: .1 }), RangeError);
    assert.throws(() => editCel('counter', 7, { pose: 21 }), RangeError); assert.deepEqual(moves.counter.cels, edited);
  } finally { resetCels(); }
  assert.deepEqual(moves.counter.cels, before); resetCels(); assert.deepEqual(moves.counter.cels, before);
});

test('held player guard also survives the stun between two closely spaced weapon contacts', () => {
  try {
    editCel('spin', 1, { duration: .2 });
    for (const facing of [1, -1] as const) {
      const s = ready(200, facing); s.worker.action = { kind: 'spin', time: moves.spin.windup, connected: false };
      advance(s, .6, { block: true }); assert.equal(s.blocked, 2); assert.equal(s.player.hp, 100);
    }
  } finally { resetCels(); }
});

test('both finishers can end a real round and enter the existing visible KO sequence', () => {
  for (const kind of ['ram', 'counter'] as const) {
    const s = ready(280); s.training.enabled = false; s.brain.timer = 999; s.aiWait = 999;
    s.worker.hp = kind === 'ram' ? 28 : 25;
    advance(s, dt, { attackPressed: kind });
    for (let i = 0; i < 180 && s.phase === 'fighting'; i++) advance(s, dt);
    assert.equal(s.hits, 2); assert.equal(s.worker.hp, 0); assert.equal(s.phase, 'ending');
    assert.equal(s.ending?.reason, 'ko'); assert.equal(s.ending?.stage, 'fall');
  }
});
