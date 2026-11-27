import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { commandState, observeDirections, lightCommand, heavyCommand } from '../src/fight/commands.ts';
import { createFight, idleInput, stepFight, pauseFight, resumeFight, copyTraining, type Fight, type Input } from '../src/fight/model.ts';
import { boxerPose } from '../src/fight/boxer-animation.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';
import { moves, celAt, editCel, resetCels, boxerHurtByPose, risingHop } from '../src/fight/moves.ts';

const dt = 1 / 120;
const actionKind = (s: Fight) => s.player.action?.kind;
function ready(distance = 180, facing: 1 | -1 = 1, wall = false) {
  const s = createFight('street', true); s.phase = 'fighting';
  s.worker.x = wall ? facing === 1 ? 1385 : 215 : 800;
  s.player.x = s.worker.x - facing * distance; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  s.worker.stop = 10;
  return s;
}
function advance(s: Fight, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}

test('up plus light invokes rising in either facing, with release grace; old commands remain distinct', () => {
  for (const facing of [1, -1] as const) {
    const state = commandState(), up = { ...idleInput(), up: true };
    observeDirections(state, up, facing, 0);
    assert.equal(lightCommand(state, up, facing, 0), 'rising');
    assert.equal(heavyCommand(state, up, facing, 0), 'overhand');
    assert.equal(lightCommand(state, { ...up, down: true }, facing, 0), 'low');
    assert.equal(heavyCommand(state, { ...up, down: true }, facing, 0), 'upper');
    assert.equal(lightCommand(state, up, facing, 0, false), 'light');
    assert.equal(lightCommand(state, { ...up, block: true }, facing, 0), 'light');
    observeDirections(state, idleInput(), facing, .1);
    assert.equal(lightCommand(state, idleInput(), facing, .24), 'rising');
    assert.equal(lightCommand(state, idleInput(), facing, .240001), 'light');
    observeDirections(state, { ...idleInput(), block: true }, facing, .15);
    assert.equal(lightCommand(state, idleInput(), facing, .16), 'light');
  }
});

test('selected three drawings and per-key boxes follow exact phase boundaries with no return hitbox', () => {
  const f = createFight().player;
  for (const [time, pose, active] of [[0,0,false],[.039999,0,false],[.04,14,false],[.079999,14,false],[.08,15,true],[.219999,15,true],[.22,14,false],[.239999,14,false],[.24,0,false],[.539999,0,false]] as const) {
    f.action = { kind: 'rising', time, connected: false };
    assert.equal(boxerPose(f), pose); assert.equal(fighterGeometry(f).hit.length, active ? 1 : 0);
    if (pose !== 0) assert.deepEqual(celAt('rising', time).cel.hurt, boxerHurtByPose[pose]);
  }
  assert.equal(moves.rising.windup, .08); assert.equal(moves.rising.active, .14); assert.equal(moves.rising.recovery, .32);
  for (const facing of [1, -1] as const) {
    f.facing = facing; f.x = 700; f.y = 30;
    f.action = { kind: 'rising', time: .08, connected: false };
    const g = fighterGeometry(f);
    assert.deepEqual(g.hit, [{ left: 700 + (facing === 1 ? 55 : -175), right: 700 + (facing === 1 ? 175 : -55), bottom: 430, top: 570 }]);
    assert.equal(g.hurt.length, 7);
  }
});

test('standing uppercut hits once at its edge, misses outside, can be blocked or ducked and launches airborne targets', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) {
    for (const [distance, guard, duck, y, hp] of [[240,false,false,0,97],[240.1,false,false,0,120],[180,true,false,0,120],[180,false,true,0,120],[180,false,false,100,97],[180,false,false,600,120]] as const) {
      const s = ready(distance, facing, wall);
      s.worker.blocking = guard; s.worker.crouch = duck; s.worker.y = y;
      s.player.action = { kind: 'rising', time: .08 - dt, connected: false };
      stepFight(s, idleInput(), dt);
      assert.equal(s.worker.hp, hp, `${distance}/${guard}/${duck}/${y}/${facing}/${wall}`);
      if (hp === 97) { assert.equal(s.worker.reaction, 'launch'); assert.equal(s.worker.vy, 620); assert.ok(s.worker.knockback * facing > 0); }
      if (guard) assert.equal(s.player.action?.result, 'block');
      advance(s, .8); assert.equal(s.worker.hp, hp);
    }
    const rear = ready(180, facing, wall); rear.player.facing = facing === 1 ? -1 : 1;
    rear.player.action = { kind: 'rising', time: .08 - dt, connected: false }; stepFight(rear, idleInput(), dt);
    assert.equal(rear.worker.hp, 120);
  }
});

test('actual up-light input hops vertically, does not repeat on hold or consume punch alternation, even at walls', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) {
    const s = ready(300, facing, wall), x = s.player.x; s.worker.stop = 0;
    stepFight(s, { ...idleInput(), up: true, light: true }, dt);
    assert.equal(s.player.action?.kind, 'rising'); assert.equal(s.player.action?.lunge, 0);
    advance(s, .14, { up: true, light: true, left: facing === -1, right: facing === 1 });
    assert.ok(s.player.y > 47.9 && s.player.y <= 48); assert.equal(s.player.x, x);
    assert.equal(s.player.crouch, false); assert.equal(s.player.blocking, false);
    advance(s, .56, { up: true, light: true });
    assert.equal(s.player.action, null); assert.equal(s.hits, 0); assert.equal(s.player.x, x); assert.equal(s.player.y, 0); assert.equal(s.player.vy, 0);
    assert.equal(s.lightHand, 'jab'); assert.equal(s.heavyHand, 'left');
    advance(s, .2); stepFight(s, { ...idleInput(), light: true }, dt); assert.equal(actionKind(s), 'jab');
  }
  const air = ready(500); air.player.y = 600;
  stepFight(air, { ...idleInput(), attackPressed: 'rising' }, dt); advance(air, .15);
  assert.equal(air.player.action, null);
  const block = ready(500); advance(block, .2, { up: true, light: true, block: true }); assert.equal(block.player.action, null);
});

test('hop shares the action clock and boxes, lands on idle, and interruption resumes ordinary falling', () => {
  assert.deepEqual([0, .04, .14, .24, .54].map(risingHop), [0, 0, 48, 0, 0]);
  for (const time of [.08, .14, .219]) {
    const s = ready(240);
    s.player.action = { kind: 'rising', time: time - dt, connected: false };
    stepFight(s, idleInput(), dt);
    assert.equal(s.worker.hp, 97, `extended edge still hits during hop at ${time}`);
    assert.ok(Math.abs(s.player.y - risingHop(time)) < 1e-8);
    const height = s.player.y, clock = s.player.action!.time;
    const g = fighterGeometry(s.player);
    assert.equal(g.hit[0].bottom, 400 + height); assert.equal(g.hurt[0].bottom, height);
    advance(s, .025); assert.equal(s.player.y, height); assert.equal(s.player.action?.time, clock);
    pauseFight(s); advance(s, .2); assert.equal(s.player.y, height);
    resumeFight(s); const saved = copyTraining(s); assert.equal(saved.player.y, height);
    advance(saved, .6); assert.equal(saved.player.y, 0); assert.equal(saved.player.vy, 0);
  }
  const land = ready(500); stepFight(land, { ...idleInput(), up: true, light: true }, dt);
  const events: string[] = [];
  for (let i = 0; i < 30; i++) { stepFight(land, idleInput(), dt); events.push(...land.events.map(e => e.type)); }
  assert.equal(land.player.y, 0); assert.equal(boxerPose(land.player), 0);
  assert.equal(events.filter(e => e === 'jump').length, 1); assert.equal(events.filter(e => e === 'land').length, 1);
  const interrupted = ready(180); interrupted.worker.stop = 0;
  interrupted.player.action = { kind: 'rising', time: .06 - dt, connected: false };
  interrupted.worker.action = { kind: 'sweep', time: moves.sweep.windup - dt, connected: false };
  stepFight(interrupted, idleInput(), dt);
  assert.equal(interrupted.player.action, null); assert.ok(interrupted.player.y > 0);
  const height = interrupted.player.y; advance(interrupted, .025); assert.equal(interrupted.player.y, height);
  advance(interrupted, .1);
  assert.ok(interrupted.player.y < height); advance(interrupted, .3); assert.equal(interrupted.player.y, 0);
  try {
    editCel('rising', 2, { duration: .24 });
    assert.equal(risingHop(.34), 0); assert.ok(Math.abs(risingHop(.19) - 48) < 1e-8);
  } finally { resetCels(); }
});

test('pause, hitstop, snapshot, interruption and editor changes preserve the correct action state', () => {
  const s = ready(500); s.player.action = { kind: 'rising', time: .1, connected: true };
  pauseFight(s); advance(s, .2); assert.equal(s.player.action?.time, .1);
  resumeFight(s); s.player.stop = .05; advance(s, .025); assert.equal(s.player.action?.time, .1);
  const saved = copyTraining(s); assert.equal(saved.player.action?.kind, 'rising'); assert.equal(boxerPose(saved.player), 15);
  assert.equal(saved.commands.modifier, null);
  const hit = ready(180); hit.worker.stop = 0; hit.worker.action = { kind: 'poke', time: moves.poke.windup - dt, connected: false };
  hit.player.action = { kind: 'rising', time: 0, connected: false }; stepFight(hit, idleInput(), dt);
  assert.equal(hit.player.action, null); assert.equal(boxerPose(hit.player), 6);
  try {
    editCel('rising', 2, { pose: 14 }); assert.deepEqual(moves.rising.cels[2].hurt, boxerHurtByPose[14]);
    editCel('rising', 2, { pose: 15 });
    assert.throws(() => editCel('rising', 2, { pose: 27 }), RangeError);
    assert.throws(() => editCel('poke', 1, { pose: 14 }), RangeError);
  } finally { resetCels(); }
});

test('runtime frame origins and hashes match the chosen preview; the contact box extends beyond the fist', () => {
  const audit = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/standing-uppercut-preview/one-inbetween/runtime-assets.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.boxer.length, 27); assert.equal(audit.frames.length, 2);
  for (const frame of audit.frames) {
    const bytes = readFileSync(new URL(`../public/art/fight/boxer-${frame.pose}.webp`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), frame.runtime_sha256);
    assert.equal(frame.rgba_matches_preview, true);
    assert.deepEqual(manifest.boxer[frame.pose], { width: 500, height: 550, anchorX: 228, anchorY: 525, scale: 1.19 });
  }
  assert.equal(audit.frames[0].source_sha256, 'db17bdebdea043bf0bafb5aae5588560e603dd5cfd5cee4cfad9638b8a65f64f');
  assert.equal(audit.frames[1].source_sha256, 'f70587c80fbcf944f8b7f113fd95e795cd69c121307b13c383f1954100727082');
  assert.equal(audit.frames[1].contact_padding, 48.86);
  assert.equal(moves.rising.range, 240);
  assert.ok(Math.abs(moves.rising.cels[2].hit[0].right - audit.frames[1].visible_tip - audit.frames[1].contact_padding) < 1e-8);
});
