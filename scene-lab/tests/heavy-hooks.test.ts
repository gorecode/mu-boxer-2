import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { boxerPose } from '../src/fight/boxer-animation.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';
import { createFight, copyTraining, idleInput, pauseFight, resumeFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
import { boxerHurtByPose, editCel, moves, resetCels } from '../src/fight/moves.ts';

const dt = 1 / 120;
function ready() { const s = createFight('street', true); s.phase = 'fighting'; s.worker.stop = 999; return s; }
const handOf = (s: Fight) => s.player.action?.hand;
function advance(s: Fight, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds * 120); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}

test('K alternates approved hands only when an attack starts; holding and rejected presses consume no hand', () => {
  const s = ready();
  stepFight(s, { ...idleInput(), heavy: true }, dt);
  assert.equal(handOf(s), 'left'); assert.equal(s.heavyHand, 'right');
  advance(s, .8, { heavy: true }); assert.equal(s.player.action, null); assert.equal(s.heavyHand, 'right');
  stepFight(s, idleInput(), dt);
  stepFight(s, { ...idleInput(), block: true, heavy: true }, dt);
  advance(s, .2, { block: true }); assert.equal(s.player.action, null); assert.equal(s.heavyHand, 'right');
  stepFight(s, { ...idleInput(), heavy: true }, dt);
  assert.equal(handOf(s), 'right'); assert.equal(s.heavyHand, 'left');
  advance(s, .8); stepFight(s, { ...idleInput(), heavy: true }, dt);
  assert.equal(handOf(s), 'left'); assert.equal(createFight().heavyHand, 'left');
});

test('light hands and direction specials do not consume the next heavy hand', () => {
  const s = ready();
  for (const kind of ['jab', 'cross', 'upper', 'overhand', 'backfist', 'long'] as const) {
    stepFight(s, { ...idleInput(), attackPressed: kind }, dt);
    assert.equal(s.player.action?.kind, kind); assert.equal(s.heavyHand, 'left');
    advance(s, 1);
  }
  stepFight(s, { ...idleInput(), heavy: true }, dt);
  assert.equal(s.player.action?.hand, 'left'); assert.equal(s.lightHand, 'jab');
});

test('both hooks use only idle and their selected contact on exact phase boundaries', () => {
  for (const [hand, pose] of [['left', 12], ['right', 13]] as const) {
    const f = createFight().player;
    for (const [time, expected] of [[0,0],[.249999,0],[.25,pose],[.369999,pose],[.37,0],[.46,0],[.65,0]]) {
      f.action = { kind: 'heavy', time, connected: false, hand };
      assert.equal(boxerPose(f), expected); assert.equal(fighterGeometry(f).hit.length, expected === pose ? 1 : 0);
    }
    f.action!.time = .25; f.reaction = 'guard'; assert.equal(boxerPose(f), 4);
    f.reaction = 'heavy'; assert.equal(boxerPose(f), 6);
    f.hp = 0; assert.equal(boxerPose(f), 11);
  }
  assert.equal(moves.heavy.damage, 20); assert.equal(moves.heavy.active, .12); assert.equal(moves.heavy.recovery, .28);
});

test('per-hand hurt zones and generous fist hitboxes mirror and follow airborne height', () => {
  for (const [hand, pose, visibleTip] of [['left',12,139.23],['right',13,155.89]] as const) for (const facing of [1,-1] as const) {
    const f = createFight().player; Object.assign(f, { x: 700, y: 30, facing });
    f.action = { kind: 'heavy', time: .25, connected: false, hand };
    const geometry = fighterGeometry(f);
    const transform = (b: { left: number; right: number; bottom: number; top: number }) => ({
      left: 700 + (facing === 1 ? b.left : -b.right), right: 700 + (facing === 1 ? b.right : -b.left), bottom: b.bottom + 30, top: b.top + 30,
    });
    assert.deepEqual(geometry.hurt, boxerHurtByPose[pose]!.map(transform));
    assert.deepEqual(geometry.hit, [transform({ left: 55, right: 178, bottom: 397, top: 525 })]);
    assert.ok(178 - visibleTip >= 20 && 178 - visibleTip <= 40);
  }
});

test('hooks hit at their distance boundary, miss outside it, and standing block still works for either hand', () => {
  for (const hand of ['left','right'] as const) for (const facing of [1,-1] as const) {
    for (const [distance, guarded, expectedHp, result] of [[243,false,100,'hit'],[244,false,120,undefined],[200,true,120,'block']] as const) {
      const s = ready(); s.player.x = 800; s.worker.x = 800 + facing * distance;
      s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1; s.worker.blocking = guarded;
      s.player.action = { kind: 'heavy', hand, time: .25 - dt, connected: false };
      stepFight(s, idleInput(), dt);
      assert.equal(s.worker.hp, expectedHp); assert.equal(s.player.action?.result, result);
    }
  }
});

test('pause, hitstop and training snapshots preserve current and next hands; editor poses stay authoritative', () => {
  const s = ready(); s.heavyHand = 'left'; s.player.action = { kind: 'heavy', hand: 'right', time: .29, connected: true };
  const saved = copyTraining(s); s.heavyHand = 'right';
  assert.equal(saved.heavyHand, 'left'); assert.equal(saved.player.action?.hand, 'right');
  pauseFight(saved); advance(saved, .2); assert.equal(boxerPose(saved.player), 13);
  resumeFight(saved); saved.player.stop = .05; advance(saved, .025); assert.equal(saved.player.action?.time, .29);
  try {
    editCel('heavy', 1, { pose: 7 }); assert.equal(boxerPose(saved.player), 7);
    editCel('heavy', 1, { pose: 13 }); assert.equal(boxerPose(saved.player), 13);
    editCel('heavy', 1, { duration: .2 }); assert.equal(moves.heavy.active, .2);
    saved.player.action!.time = .44; assert.equal(boxerPose(saved.player), 13);
    saved.player.action!.time = .45; assert.equal(boxerPose(saved.player), 0);
  } finally { resetCels(); }
  assert.equal(moves.heavy.cels[1].pose, 12);
});

test('runtime contacts and origins match the selected left and right B preview export', () => {
  const audit = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/heavy-hooks/runtime-assets.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json', import.meta.url), 'utf8'));
  assert.equal(audit.frames.length, 2); assert.equal(manifest.boxer.length, 25);
  for (const frame of audit.frames) {
    const bytes = readFileSync(new URL(`../public/art/fight/boxer-${frame.pose}.webp`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), frame.runtime_sha256);
    assert.equal(frame.rgba_matches_preview, true);
    assert.deepEqual(manifest.boxer[frame.pose], { width: 500, height: 530, anchorX: 228, anchorY: 495, scale: 1.19 });
  }
  assert.equal(audit.frames[0].source_sha256, 'f4c0d8846401b66c31e6abbf0a5ca34eb6dde877f9ed1c6432d163eebe036cc9');
  assert.equal(audit.frames[1].name, 'right-b');
  assert.equal(audit.frames[1].source_sha256, '92f0027584f0cfb1b442a3c01f6dae1f78efd2531a98fec19cdecb75647d19b5');
});
