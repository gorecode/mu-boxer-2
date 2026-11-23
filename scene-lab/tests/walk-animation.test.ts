import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canWalk, walkFrame } from '../src/fight/boxer-animation.ts';
import { copyTraining, createFight, idleInput, pauseFight, resumeFight, stepFight, type Fight } from '../src/fight/model.ts';
import { fighterGeometry, overlaps } from '../src/fight/geometry.ts';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function ready(facing: 1 | -1 = 1): Fight {
  const s = createFight('street', true); s.phase = 'fighting'; s.player.x = 700; s.player.facing = facing;
  s.worker.x = 700 + facing * 500; s.worker.stop = 99;
  return s;
}
function travel(s: Fight, distance: number): void {
  const direction = Math.sign(distance), input = { ...idleInput(), right: direction > 0, left: direction < 0 };
  for (let remaining = Math.abs(distance); remaining > 1e-8;) {
    const dt = Math.min(.05, remaining / 355); stepFight(s, input, dt); remaining -= dt * 355;
  }
}

test('the selected four drawings follow quarter-stride boundaries and wrap after 134 px', () => {
  const f = ready().player;
  assert.equal(f.walk, null); assert.equal(walkFrame(f), null);
  for (const [distance, expected] of [[0, 0], [33.499, 0], [33.5, 1], [66.999, 1], [67, 2], [100.499, 2], [100.5, 3], [133.999, 3]]) {
    f.walk = distance; assert.equal(walkFrame(f), expected);
  }
  for (const facing of [1, -1] as const) {
    const forward = ready(facing), backward = ready(facing);
    const out: (number | null)[] = [], back: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      travel(forward, facing * 33.5); out.push(walkFrame(forward.player));
      travel(backward, -facing * 33.5); back.push(walkFrame(backward.player));
    }
    assert.deepEqual(out, [1, 2, 3, 0]); assert.deepEqual(back, [3, 2, 1, 0]);
    assert.ok(Math.abs(forward.player.x - (700 + facing * 134)) < 1e-8);
  }
});

test('reversing mid-stride retraces the same phase; stopping restarts from the first transfer', () => {
  const s = ready(); travel(s, 80); assert.equal(walkFrame(s.player), 2);
  travel(s, -20); assert.equal(walkFrame(s.player), 1); assert.ok(Math.abs(s.player.walk! - 60) < 1e-8);
  stepFight(s, idleInput(), 1/120); assert.equal(s.player.walk, null); assert.equal(walkFrame(s.player), null);
  travel(s, 2); assert.equal(walkFrame(s.player), 0); assert.ok(Math.abs(s.player.walk! - 2) < 1e-8);
});

test('animation measures resolved displacement at a wall or a body, without counting passive pushing', () => {
  const s = ready(-1); s.player.x = 1384; s.worker.x = 1000;
  stepFight(s, { ...idleInput(), right: true }, .05);
  assert.equal(s.player.x, 1385); assert.equal(s.player.walk, 133);
  stepFight(s, { ...idleInput(), right: true }, .05);
  assert.equal(s.player.walk, null); assert.equal(walkFrame(s.player), null);
  const bodies = ready(); bodies.worker.x = 840;
  stepFight(bodies, { ...idleInput(), right: true }, .05);
  assert.equal(bodies.player.walk, bodies.player.x - 700);
  assert.equal(bodies.player.walk, 8.875);
  bodies.worker.x = bodies.player.x + 130;
  stepFight(bodies, idleInput(), .05);
  assert.equal(bodies.player.walk, null);
});

test('pause, hitstop and detached training snapshots preserve the exact walking pose', () => {
  const s = ready(); travel(s, 45); const phase = s.player.walk;
  pauseFight(s); stepFight(s, { ...idleInput(), right: true }, .05);
  assert.equal(s.player.walk, phase); assert.equal(walkFrame(s.player), 1);
  resumeFight(s); s.player.stop = .05;
  for (let i = 0; i < 3; i++) stepFight(s, { ...idleInput(), right: true }, 1/120);
  assert.equal(s.player.walk, phase); assert.equal(walkFrame(s.player), 1);
  const saved = copyTraining(s); s.player.walk = 100;
  assert.equal(saved.player.walk, phase); assert.equal(walkFrame(saved.player), 1);
  s.player.stop = 0; stepFight(s, idleInput(), 1/120); assert.equal(s.player.walk, null);
  assert.equal(createFight().player.walk, null);
});

test('attacks, guard, crouch, dodge, airborne, hurt, stun and defeat override walking immediately', () => {
  for (const patch of [
    { action: { kind: 'jab' as const, time: 0, connected: false } }, { blocking: true }, { crouch: true },
    { dodge: .1 }, { y: 1 }, { hurt: .1 }, { stun: .1 }, { reaction: 'light' as const }, { hp: 0 },
  ]) {
    const f = ready().player; f.walk = 67; Object.assign(f, patch);
    assert.equal(canWalk(f), false); assert.equal(walkFrame(f), null);
  }
  for (const input of [{ block: true }, { down: true }, { jump: true }, { dodge: true }, { light: true }]) {
    const s = ready(); travel(s, 45);
    stepFight(s, { ...idleInput(), right: true, ...input }, 1/120);
    assert.equal(s.player.walk, null, JSON.stringify(input)); assert.equal(walkFrame(s.player), null);
  }
});

test('walking hurt zones follow both legs and the lowered head, mirror, and leave empty space between feet', () => {
  const headTops = [570, 565.24, 560.48, 565.24];
  for (let frame = 0; frame < 4; frame++) {
    const f = ready().player; f.walk = frame * 33.5; const right = fighterGeometry(f);
    assert.equal(right.hit.length, 0); assert.equal(right.hurt.length, 4);
    assert.ok(Math.abs(Math.max(...right.hurt.map(b => b.top)) - headTops[frame]) < 1e-9);
    assert.ok(!right.hurt.some(b => overlaps(b, { left: 699, right: 701, bottom: 30, top: 50 })));
    f.facing = -1; const left = fighterGeometry(f);
    for (let i = 0; i < right.hurt.length; i++) {
      assert.equal(left.hurt[i].left, 1400 - right.hurt[i].right);
      assert.equal(left.hurt[i].right, 1400 - right.hurt[i].left);
      assert.equal(left.hurt[i].top, right.hurt[i].top);
    }
  }
  const f = ready().player; f.walk = 67;
  assert.equal(fighterGeometry(f).hurt[0].left, 458);
  assert.equal(fighterGeometry(f).hurt[1].right, 887);
  f.action = { kind: 'heavy', time: 0, connected: false };
  assert.equal(fighterGeometry(f).hurt.length, 3);
});

test('a round ending in the middle of a step returns the winner to stance', () => {
  const s = ready(); s.training.enabled = false; s.remaining = .001;
  travel(s, 2);
  assert.equal(s.phase, 'ending'); assert.equal(s.ending?.reason, 'time');
  assert.equal(s.player.hp, 100); assert.equal(s.player.walk, null); assert.equal(walkFrame(s.player), null);
});

test('runtime textures retain the four selected preview frames with the same native origin and scale', () => {
  const root = new URL('../../assets/prototypes/gameplay/walk-keypose-preview/', import.meta.url);
  const audit = JSON.parse(readFileSync(new URL('runtime-assets.json', root), 'utf8')) as { frame: number; source_sha256: string; runtime_sha256: string }[];
  const manifest = JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json', import.meta.url), 'utf8'));
  assert.equal(audit.length, 4); assert.equal(manifest.walk.length, 4);
  for (const [i, entry] of audit.entries()) {
    assert.equal(entry.frame, i);
    const source = readFileSync(new URL(`frames/${i}.png`, root));
    const runtime = readFileSync(new URL(`../public/art/fight/walk/walk-${i}.webp`, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), entry.source_sha256);
    assert.equal(createHash('sha256').update(runtime).digest('hex'), entry.runtime_sha256);
    assert.deepEqual(manifest.walk[i], { width: 500, height: 530, anchorX: 228, anchorY: 495, scale: 1.19 });
  }
});
