import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFight, idleInput, stepFight, pauseFight, resumeFight, copyTraining, type Fight, type Input } from '../src/fight/model.ts';
import { commandState, kickCommand } from '../src/fight/commands.ts';
import { moves, celAt, editCel, resetCels, boxerHurtByPose } from '../src/fight/moves.ts';
import { boxerPose } from '../src/fight/boxer-animation.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';

const dt = 1 / 120;
const kicks = ['crouchKick', 'crouchSweep'] as const;
function ready(distance = 240, facing: 1 | -1 = 1) {
  const s = createFight('street', true); s.phase = 'fighting';
  s.worker.x = facing === 1 ? 1000 : 600; s.player.x = s.worker.x - facing * distance;
  s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  s.worker.stop = 10;
  return s;
}
function advance(s: Fight, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}

test('crouched N and back N select crouched kicks before standing moves and motions, only on the ground', () => {
  for (const facing of [1, -1]) for (const rear of [false, true]) {
    const state = { ...commandState(), forwardDouble: 1, backForward: 1 };
    assert.equal(kickCommand(state, { ...idleInput(), down: true }, facing, 1.1, true, rear), rear ? 'rearKick' : 'crouchKick');
    assert.equal(kickCommand(state, { ...idleInput(), down: true }, facing, 1.1, false, rear), rear ? 'rearKick' : 'leadKick');
    assert.equal(kickCommand(commandState(), idleInput(), facing, 1, true, rear), rear ? 'rearKick' : 'leadKick');
    const back = facing === 1 ? 'left' : 'right', forward = facing === 1 ? 'right' : 'left';
    assert.equal(kickCommand(state, { ...idleInput(), down: true, [back]: true }, facing, 1.1, true, rear), rear ? 'rearKick' : 'crouchSweep');
    assert.equal(kickCommand(state, { ...idleInput(), down: true, [forward]: true }, facing, 1.1, true, rear), rear ? 'rearKick' : 'crouchKick');
    assert.equal(kickCommand(state, { ...idleInput(), down: true, left: true, right: true }, facing, 1.1, true, rear), rear ? 'rearKick' : 'crouchKick');
  }
});

test('chosen keys have exact timing, crouched recovery, mirrored hit zones and no return damage', () => {
  for (const kind of kicks) for (const facing of [1, -1] as const) {
    const f = ready(240, facing).player, first = kind === 'crouchKick' ? 21 : 23;
    const samples = kind === 'crouchKick'
      ? [[0, first, false], [.079999, first, false], [.08, 22, true], [.199999, 22, true], [.2, first, false], [.239999, first, false], [.24, 5, false]] as const
      : [[0, 23, false], [.049999, 23, false], [.05, 25, false], [.109999, 25, false], [.11, 26, false], [.149999, 26, false], [.15, 24, true], [.249999, 24, true], [.25, 23, false], [.309999, 23, false], [.31, 5, false], [.619999, 5, false]] as const;
    for (const [time, pose, active] of samples) {
      f.action = { kind, time, connected: false };
      assert.equal(boxerPose(f), pose);
      assert.equal(fighterGeometry(f).hit.length, active ? 1 : 0);
      if (pose !== 5) assert.deepEqual(celAt(kind, time).cel.hurt, boxerHurtByPose[pose]);
      if (active) {
        const hit = fighterGeometry(f).hit[0];
        assert.equal(facing === 1 ? hit.right - f.x : f.x - hit.left, kind === 'crouchKick' ? 256 : 379);
      }
    }
    const hit = moves[kind].cels.find(c => c.phase === 'active')!.hit[0], tip = kind === 'crouchKick' ? 236.81 : 360.57;
    assert.ok(hit.right - tip >= 12 && hit.right - tip <= 24);
  }
});

test('held crouched N/back N and direct touch inputs crouch, stay planted, do not repeat or change punch hands', () => {
  for (const kind of kicks) for (const facing of [1, -1] as const) for (const direct of [false, true]) {
    const s = ready(600, facing), x = s.player.x;
    const button = 'leadKick';
    const input = direct ? { [kind]: true } : { down: true, [button]: true, ...(kind === 'crouchSweep' ? { [facing === 1 ? 'left' : 'right']: true } : {}) };
    stepFight(s, { ...idleInput(), ...input }, dt);
    assert.equal(s.player.action?.kind, kind); assert.equal(s.player.crouch, true);
    advance(s, .25, { left: true });
    assert.equal(s.player.x, x); assert.equal(s.player.y, 0); assert.equal(s.player.crouch, true);
    advance(s, 1, { ...input, [button]: true });
    assert.equal(s.player.action, null); assert.equal(s.player.x, x);
    assert.equal(s.lightHand, 'jab'); assert.equal(s.heavyHand, 'left');
    stepFight(s, idleInput(), dt); assert.equal(s.player.crouch, false);
  }
});

test('low contacts hit once at reach, miss outside/behind/in air, and need a low block', () => {
  for (const kind of kicks) for (const facing of [1, -1] as const) for (const mode of ['edge', 'outside', 'behind', 'low-block', 'high-block', 'air'] as const) {
    const edge = moves[kind].range;
    const s = ready(mode === 'outside' ? edge + .01 : mode === 'behind' ? -edge : edge, facing);
    if (mode.endsWith('block')) { s.worker.blocking = true; s.worker.crouch = mode === 'low-block'; }
    if (mode === 'air') s.worker.y = 500;
    s.player.action = { kind, time: moves[kind].windup - dt, connected: false };
    stepFight(s, idleInput(), dt);
    const hit = mode === 'edge' || mode === 'high-block';
    assert.equal(s.worker.hp, hit ? 120 - moves[kind].damage : 120, `${kind}/${mode}/${facing}`);
    if (hit) assert.equal(s.worker.reaction, kind === 'crouchKick' ? 'light' : 'down');
    if (mode === 'low-block') assert.equal(s.player.action?.result, 'block');
    advance(s, 1); assert.equal(s.worker.hp, hit ? 120 - moves[kind].damage : 120);
  }
});

test('block, air and stun expire buffered kicks; pause/load and hitstop preserve contact', () => {
  for (const kind of kicks) {
    for (const mode of ['block', 'air', 'stun']) {
      const s = ready(600);
      if (mode === 'air') s.player.y = 500;
      if (mode === 'stun') s.player.stun = .5;
      advance(s, .25, { [kind]: true, block: mode === 'block' });
      assert.equal(s.player.action, null); assert.equal(s.buffered, null);
    }
    const s = ready(); s.player.action = { kind, time: moves[kind].windup - dt, connected: false };
    stepFight(s, idleInput(), dt); const time = s.player.action!.time;
    assert.equal(s.player.action?.result, 'hit');
    advance(s, .025); assert.equal(s.player.action?.time, time);
    pauseFight(s); advance(s, .5); assert.equal(s.player.action?.time, time);
    resumeFight(s); const restored = copyTraining(s); advance(restored, 1.5);
    assert.equal(restored.player.action, null); assert.equal(s.player.action?.time, time);
    const interrupted = ready(); interrupted.worker.stop = 0;
    interrupted.player.action = { kind, time: 0, connected: false };
    interrupted.worker.action = { kind: 'sweep', time: .5 - dt, connected: false };
    stepFight(interrupted, idleInput(), dt); assert.equal(interrupted.player.action, null);
  }
});

test('editor accepts new poses, rejects out-of-range poses, and restores selected cels', () => {
  try {
    editCel('crouchKick', 1, { pose: 24 }); assert.deepEqual(moves.crouchKick.cels[1].hurt, boxerHurtByPose[24]);
    editCel('crouchSweep', 1, { pose: 26 }); assert.deepEqual(moves.crouchSweep.cels[1].hurt, boxerHurtByPose[26]);
    for (const pose of [-1, 27, .5, NaN]) assert.throws(() => editCel('crouchKick', 1, { pose }), RangeError);
    assert.throws(() => editCel('sweep', 1, { pose: 24 }), RangeError);
  } finally { resetCels(); }
  assert.deepEqual(moves.crouchKick.cels.map(c => c.pose), [21, 22, 21, 5]);
  assert.deepEqual(moves.crouchSweep.cels.map(c => c.pose), [23, 25, 26, 24, 23, 5]);
  assert.deepEqual(moves.crouchSweep.cels.map(c => c.duration), [.05, .06, .04, .10, .06, .31]);
  assert.ok(Math.abs(moves.crouchSweep.windup + moves.crouchSweep.active + moves.crouchSweep.recovery - .62) < 1e-9);
});

test('four runtime files retain the approved PNG registration and recorded hashes', () => {
  const records = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/crouching-kick-previews/runtime-assets.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json', import.meta.url), 'utf8'));
  assert.equal(records.length, 4); assert.equal(manifest.boxer.length, 27);
  for (const [i, record] of records.entries()) {
    const bytes = readFileSync(new URL(`../public/art/fight/boxer-${21 + i}.webp`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.runtime_sha256);
    assert.deepEqual(manifest.boxer[21 + i], { width: 640, height: 550, anchorX: 240, anchorY: 485, scale: 1.19 });
  }
});

test('selected rear views retain exact runtime hashes, registration and non-damaging windup', () => {
  const records = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/sweep-turn-previews/runtime-assets.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json', import.meta.url), 'utf8'));
  assert.equal(records.length, 2);
  for (const [i, record] of records.entries()) {
    const bytes = readFileSync(new URL(`../public/art/fight/boxer-${25 + i}.webp`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.runtime_sha256);
    assert.deepEqual(manifest.boxer[25 + i], { width: 840, height: 550, anchorX: 380, anchorY: 485, scale: 1.19 });
  }
  for (const facing of [1, -1] as const) {
    const s = ready(240, facing), x = s.player.x;
    stepFight(s, { ...idleInput(), crouchSweep: true }, dt);
    advance(s, 16 * dt);
    assert.equal(s.worker.hp, 120); assert.equal(s.player.x, x);
    assert.equal(boxerPose(s.player), 26);
    advance(s, 2 * dt); assert.equal(s.worker.hp, 103); assert.equal(boxerPose(s.player), 24);
    advance(s, 1); assert.equal(s.worker.hp, 103); assert.equal(s.player.action, null);
  }
});
