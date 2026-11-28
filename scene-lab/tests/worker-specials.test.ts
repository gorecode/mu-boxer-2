import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFight, copyTraining, idleInput, moves, pauseFight, resumeFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
import { celAt, editCel, resetCels, strikeAt, strikeMove } from '../src/fight/moves.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';

const dt = 1 / 120;
function ready(distance = 200, facing: 1 | -1 = 1, cpu = false) {
  const s = createFight('street', true); s.phase = 'fighting'; s.resume = 'fighting'; s.training.dummy = cpu ? 'cpu' : 'idle';
  s.worker.x = 800; s.player.x = 800 - facing * distance;
  s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  s.brain.observedDistance = distance; s.aiWait = 0;
  return s;
}
function advance(s: Fight, seconds: number, input: Partial<Input> = {}) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    stepFight(s, { ...idleInput(), ...input }, dt); events.push(...s.events);
  }
  return events;
}
function until(s: Fight, predicate: () => boolean, input: Partial<Input> = {}, seconds = 3) {
  for (let i = 0; i < Math.round(seconds / dt) && !predicate(); i++) stepFight(s, { ...idleInput(), ...input }, dt);
  assert.ok(predicate(), 'expected a combat transition within the bounded wait');
}

test('shove hits once, pushes without launch and stays short, mirrored and punishable', () => {
  for (const facing of [1, -1] as const) {
    const s = ready(210, facing), x = s.player.x, wx = s.worker.x;
    s.worker.action = { kind: 'shove', time: 0, connected: false };
    advance(s, .23); assert.equal(s.player.hp, 100); assert.equal(s.player.x, x);
    const contacts = advance(s, 1).filter(e => e.type === 'hit');
    assert.equal(contacts.length, 1); assert.equal(s.player.hp, 92);
    assert.ok((x - s.player.x) * facing > 195); assert.equal(s.player.y, 0); assert.equal(s.worker.x, wx);
    assert.notEqual(s.player.reaction, 'down'); assert.equal(s.worker.action, null);
    for (const [distance, hp] of [[215, 92], [215.01, 100]] as const) {
      const edge = ready(distance, facing); edge.worker.action = { kind: 'shove', time: 0, connected: false };
      advance(edge, .5); assert.equal(edge.player.hp, hp, `distance=${distance}, facing=${facing}`);
    }
    const whiff = ready(270, facing); whiff.worker.action = { kind: 'shove', time: 0, connected: false };
    advance(whiff, .41); assert.equal(whiff.player.hp, 100);
    stepFight(whiff, { ...idleInput(), light: true }, dt); advance(whiff, .12);
    assert.equal(whiff.worker.hp, 112); assert.equal(whiff.worker.action, null);
  }
});

test('shove respects both guards, walls and interruption during its preparation', () => {
  for (const facing of [1, -1] as const) for (const down of [false, true]) {
    const s = ready(180, facing), x = s.player.x;
    s.worker.action = { kind: 'shove', time: 0, connected: false };
    advance(s, 1, { block: true, down });
    assert.equal(s.player.hp, 100); assert.equal(s.player.guard, 79);
    assert.ok((x - s.player.x) * facing > 39 && (x - s.player.x) * facing < 43);
  }
  const wall = ready(); wall.player.x = 215; wall.worker.x = 415;
  wall.worker.action = { kind: 'shove', time: 0, connected: false };
  advance(wall, 1); assert.equal(wall.player.x, 215); assert.equal(wall.player.hp, 92);
  const interrupted = ready(180); interrupted.worker.action = { kind: 'shove', time: 0, connected: false };
  stepFight(interrupted, { ...idleInput(), light: true }, dt); advance(interrupted, .15);
  assert.equal(interrupted.worker.hp, 112); assert.equal(interrupted.worker.action, null); assert.equal(interrupted.player.hp, 100);
});

test('low-high blocks only with the appropriate level at each separate contact', () => {
  for (const facing of [1, -1] as const) {
    for (const [down, hp, guard] of [[false, 92, 71], [true, 84, 79]] as const) {
      const s = ready(300, facing); s.worker.action = { kind: 'lowHigh', time: 0, connected: false };
      until(s, () => s.worker.action?.contacts?.length === 2, { block: true, down });
      assert.equal(s.player.hp, hp); assert.equal(s.player.guard, guard);
    }
    const switched = ready(300, facing); switched.worker.action = { kind: 'lowHigh', time: 0, connected: false };
    until(switched, () => switched.worker.action!.time >= .56, { block: true, down: true });
    assert.equal(switched.player.hp, 100); assert.equal(switched.blocked, 1);
    advance(switched, 1.3, { block: true });
    assert.equal(switched.player.hp, 100); assert.equal(switched.blocked, 2); assert.equal(switched.player.guard, 50);
    const hit = ready(300, facing); hit.worker.action = { kind: 'lowHigh', time: 0, connected: false };
    const contacts = advance(hit, 1.8).filter(e => e.type === 'hit');
    assert.deepEqual(contacts.map(e => e.power), [8, 16]); assert.equal(hit.player.hp, 76); assert.equal(hit.player.y, 0);
  }
  assert.equal(strikeMove('lowHigh', 0).level, 'low'); assert.equal(strikeMove('lowHigh', 1).level, 'overhead');
});

test('low-high has a real interruptible gap and no hitboxes on either windup or return', () => {
  const s = ready(300); s.worker.action = { kind: 'lowHigh', time: 0, connected: false };
  for (const time of [0, .31, .49, .55, .60, .83, 1.01, 1.43]) {
    s.worker.action.time = time; assert.equal(fighterGeometry(s.worker).hit.length, 0, `time=${time}`);
  }
  for (const [time, strike] of [[.32, 0], [.84, 1]] as const) {
    s.worker.action.time = time; assert.equal(strikeAt('lowHigh', time), strike); assert.equal(fighterGeometry(s.worker).hit.length, 1);
  }
  s.worker.action.time = 0;
  until(s, () => s.worker.action!.time >= .56, { block: true, down: true });
  stepFight(s, { ...idleInput(), light: true }, dt); advance(s, .15);
  assert.equal(s.worker.hp, 112); assert.equal(s.worker.action, null); assert.equal(s.player.hp, 100);
});

test('low-high respects each strike range, can miss first and hit second, and broken guard cannot block the follow-up', () => {
  const far = ready(480); far.worker.action = { kind: 'lowHigh', time: 0, connected: false };
  advance(far, 1.6); assert.equal(far.player.hp, 92); assert.equal(far.worker.action, null);
  const late = ready(530); late.worker.action = { kind: 'lowHigh', time: 0, connected: false };
  advance(late, .5); assert.equal(late.player.hp, 100); assert.deepEqual(late.worker.action!.contacts, undefined);
  const hits = advance(late, .6, { right: true }).filter(e => e.type === 'hit');
  assert.deepEqual(hits.map(e => e.power), [16]); assert.deepEqual(late.worker.action!.contacts, [1]);
  const broken = ready(300); broken.player.guard = 10; broken.worker.action = { kind: 'lowHigh', time: 0, connected: false };
  until(broken, () => broken.player.guard === 0, { block: true, down: true });
  assert.equal(broken.player.hp, 100); assert.equal(broken.player.blocking, false);
  advance(broken, .7, { block: true }); assert.equal(broken.player.hp, 84);
});

test('Warmup scales both new strike damages independently', () => {
  for (const [kind, hp] of [['shove', 94], ['lowHigh', 83]] as const) {
    const s = ready(kind === 'shove' ? 200 : 300); s.difficulty = 'warmup';
    s.worker.action = { kind, time: 0, connected: false }; advance(s, 1.8); assert.equal(s.player.hp, hp);
  }
});

test('new move hitstop, pause and training snapshot preserve the remaining sequence', () => {
  for (const kind of ['shove', 'lowHigh'] as const) {
    const s = ready(kind === 'shove' ? 200 : 300); s.worker.action = { kind, time: 0, connected: false };
    until(s, () => s.worker.action!.contacts?.includes(0) === true);
    const time = s.worker.action!.time, x = s.player.x;
    advance(s, .025); assert.equal(s.worker.action!.time, time); assert.equal(s.player.x, x);
    const copy = copyTraining(s); pauseFight(s); advance(s, 1); resumeFight(s);
    advance(s, 2); advance(copy, 2); assert.deepEqual(s, copy);
    assert.equal(s.player.hp, kind === 'shove' ? 92 : 76);
  }
});

test('Street advances into shovel range while Warmup and passive training allow more space', () => {
  for (const facing of [1, -1] as const) {
    const street = ready(500, facing, true), warmup = ready(500, facing, true), dummy = ready(500, facing);
    warmup.difficulty = 'warmup'; warmup.brain.timer = .24;
    const x = street.worker.x;
    advance(street, .8); advance(warmup, .8); advance(dummy, .8);
    assert.ok((x - street.worker.x) * facing > 50); assert.equal(warmup.worker.x, x); assert.equal(dummy.worker.x, x);
    until(street, () => street.worker.action !== null); assert.ok(['poke', 'spin', 'thrust'].includes(street.worker.action!.kind));
  }
});

test('a close successful shovel block feeds a faster shove and repeated jabs can no longer suppress that answer', () => {
  const s = ready(180, 1, true);
  s.brain.intent = 'guard'; s.brain.timer = .6; s.brain.decisions = 4;
  let block = false, shove = false;
  for (let i = 0; i < 180; i++) {
    stepFight(s, { ...idleInput(), ...(!s.player.action ? { attackPressed: 'jab' as const } : {}) }, dt);
    block ||= s.events.some(e => e.type === 'block' && e.target === 'worker');
    shove ||= s.events.some(e => e.attack === 'shove' && e.target === 'player' && e.type === 'hit');
    if (shove) break;
  }
  assert.ok(block); assert.ok(shove); assert.equal(s.player.hp, 92);
});

test('Street observes an attack before guarding, and new worker cels are available to the editor', () => {
  const s = ready(300, 1, true);
  advance(s, .15, { heavy: true }); assert.equal(s.worker.blocking, false);
  until(s, () => s.worker.blocking); assert.ok(s.time >= .2);
  const before = structuredClone(moves.shove.cels);
  try {
    editCel('shove', 1, { pose: 12 }); assert.equal(celAt('shove', .24).cel.pose, 12);
    assert.throws(() => editCel('shove', 1, { pose: 13 }), RangeError);
    assert.equal(moves.shove.cels[1].pose, 12);
  } finally { resetCels(); }
  assert.deepEqual(moves.shove.cels, before);
});

test('runtime shove uses the approved source hashes and registration; old worker drawings are unchanged', () => {
  const root = new URL('../../', import.meta.url);
  const audit = JSON.parse(readFileSync(new URL('assets/prototypes/gameplay/worker-move-previews/runtime-assets.json', root), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('scene-lab/public/art/fight/manifest.json', root), 'utf8'));
  assert.equal(manifest.worker.length, 13);
  assert.deepEqual(manifest.worker[12], { width: 500, height: 550, anchorX: 228, anchorY: 525, scale: 1.22 });
  const digest = (path: string) => createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex');
  assert.equal(digest(audit.source), audit.source_sha256); assert.equal(digest(audit.runtime), audit.runtime_sha256);
  assert.equal(Object.keys(audit.unchanged_worker_sha256).length, 12);
  for (const [name, hash] of Object.entries(audit.unchanged_worker_sha256)) assert.equal(digest(`scene-lab/public/art/fight/${name}`), hash);
});
