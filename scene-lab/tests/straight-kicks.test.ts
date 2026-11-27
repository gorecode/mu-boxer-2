import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFight, idleInput, stepFight, pauseFight, resumeFight, copyTraining, type Fight, type Input } from '../src/fight/model.ts';
import { moves, boxerHurtByPose, celAt, editCel, resetCels } from '../src/fight/moves.ts';
import { boxerPose } from '../src/fight/boxer-animation.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';

const dt = 1 / 120;
const kicks = ['leadKick', 'rearKick'] as const;
const kindOf = (s: Fight) => s.player.action?.kind;
const handOf = (s: Fight) => s.player.action?.hand;
function ready(distance = 600, facing: 1 | -1 = 1, wall = false) {
  const s = createFight('street', true); s.phase = 'fighting';
  s.worker.x = wall ? facing === 1 ? 1385 : 215 : facing === 1 ? 900 : 700;
  s.player.x = s.worker.x - facing * distance;
  s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1; s.worker.stop = 10;
  return s;
}
function advance(s: Fight, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepFight(s, { ...idleInput(), ...input }, dt);
}

test('both kicks play selected preparation/contact/quick return at exact phase boundaries, mirrored', () => {
  for (const kind of kicks) for (const facing of [1, -1] as const) {
    const f = ready(400, facing).player, first = kind === 'leadKick' ? 16 : 18;
    const total = kind === 'leadKick' ? .44 : .56;
    for (const [time, pose, active] of [[0,first,false],[.079999,first,false],[.08,first+1,true],[.199999,first+1,true],[.2,first,false],[.239999,first,false],[.24,0,false],[total-dt,0,false]] as const) {
      f.action = { kind, time, connected: false };
      assert.equal(boxerPose(f), pose);
      const g = fighterGeometry(f), c = celAt(kind, time).cel;
      assert.equal(g.hit.length, active ? 1 : 0);
      assert.deepEqual(c.hurt, pose === 0 ? moves[kind].cels[3].hurt : boxerHurtByPose[pose]);
      if (active) {
        assert.deepEqual(g.hit[0], { left: f.x + (facing === 1 ? 55 : -(moves[kind].range - 65)),
          right: f.x + (facing === 1 ? moves[kind].range - 65 : -55), bottom: kind === 'leadKick' ? 285 : 280, top: kind === 'leadKick' ? 420 : 418 });
      }
    }
    assert.equal(moves[kind].windup, .08); assert.equal(moves[kind].active, .12);
    assert.ok(Math.abs(moves[kind].windup + moves[kind].active + moves[kind].recovery - total) < 1e-9);
  }
});

test('standing kick inputs stay planted at walls, never autorepeat or consume punch hands', () => {
  for (const kind of kicks) for (const facing of [1, -1] as const) for (const wall of [false, true]) {
    const s = ready(600, facing, wall), x = s.player.x;
    s.player.crouch = true;
    const input = { ...idleInput(), [kind]: true, down: false, left: facing === -1, right: facing === 1 };
    stepFight(s, input, dt); assert.equal(kindOf(s), kind); assert.equal(s.player.crouch, false);
    advance(s, .3, input); assert.equal(s.player.x, x); assert.equal(s.player.y, 0);
    advance(s, .7, { [kind]: true }); assert.equal(s.player.action, null); assert.equal(s.player.x, x);
    assert.equal(s.lightHand, 'jab'); assert.equal(s.heavyHand, 'left');
    stepFight(s, idleInput(), dt); stepFight(s, { ...idleInput(), [kind]: true }, dt); assert.equal(kindOf(s), kind);
  }
});

test('kick reach hits once at its edge, misses outside or behind, can be ducked, blocked and avoided in air', () => {
  for (const kind of kicks) for (const facing of [1, -1] as const) for (const wall of [false, true]) {
    for (const mode of ['edge', 'outside', 'back', 'block', 'duck', 'air', 'immune', 'down'] as const) {
      const distance = moves[kind].range + (mode === 'outside' ? .1 : 0), s = ready(distance, facing, wall);
      if (mode === 'back') s.player.facing = facing === 1 ? -1 : 1;
      s.worker.blocking = mode === 'block'; s.worker.crouch = mode === 'duck';
      s.worker.y = mode === 'air' ? 500 : 0;
      s.worker.invulnerable = mode === 'immune' ? 1 : 0;
      s.worker.reaction = mode === 'down' ? 'down' : null;
      s.player.action = { kind, time: .08 - dt, connected: false };
      stepFight(s, idleInput(), dt);
      assert.equal(s.worker.hp, mode === 'edge' ? 120 - moves[kind].damage : 120, `${kind}/${facing}/${wall}/${mode}`);
      if (mode === 'edge') {
        assert.equal(s.player.action?.result, 'hit'); assert.equal(s.worker.reaction, 'heavy'); assert.equal(s.worker.vy, 0);
        assert.equal(s.worker.knockback, facing * moves[kind].push * 12);
      }
      if (mode === 'block') { assert.equal(s.player.action?.result, 'block'); assert.equal(s.worker.guard, 100 - moves[kind].damage - 13); }
      advance(s, 1); assert.equal(s.worker.hp, mode === 'edge' ? 120 - moves[kind].damage : 120);
    }
  }
});

test('kicks obey block, air, stun, buffer expiry and recovery instead of cancelling into repeated hits', () => {
  for (const kind of kicks) {
    for (const mode of ['block', 'air', 'stun'] as const) {
      const s = ready();
      if (mode === 'air') { s.player.y = 500; s.player.vy = 0; }
      if (mode === 'stun') s.player.stun = .4;
      advance(s, .25, { [kind]: true, block: mode === 'block' }); assert.equal(s.player.action, null); assert.equal(s.buffered, null);
      advance(s, .8); assert.equal(s.player.action, null);
    }
    const s = ready(); stepFight(s, { ...idleInput(), [kind]: true }, dt);
    advance(s, .25); stepFight(s, { ...idleInput(), heavy: true }, dt);
    advance(s, .1); assert.equal(kindOf(s), kind);
    advance(s, .3); assert.equal(s.player.action, null); assert.equal(s.heavyHand, 'left');
    stepFight(s, { ...idleInput(), attackPresses: [kind] }, dt); assert.equal(kindOf(s), kind);
    const t = moves[kind].windup + moves[kind].active + moves[kind].recovery;
    advance(s, t - .05); stepFight(s, { ...idleInput(), attackPresses: ['heavy'] }, dt); advance(s, .06);
    assert.equal(kindOf(s), 'heavy'); assert.equal(handOf(s), 'left');
  }
});

test('contact hitstop, pause and training load preserve exact cel; a received hit interrupts the kick', () => {
  for (const kind of kicks) {
    const s = ready(240); s.player.action = { kind, time: .08 - dt, connected: false };
    stepFight(s, idleInput(), dt); assert.equal(s.player.action?.result, 'hit');
    const time = s.player.action!.time, pose = boxerPose(s.player);
    advance(s, .025); assert.equal(s.player.action?.time, time); assert.equal(boxerPose(s.player), pose);
    pauseFight(s); advance(s, .2); assert.equal(s.player.action?.time, time);
    resumeFight(s); const restored = copyTraining(s); assert.equal(boxerPose(restored.player), pose);
    advance(restored, 1); assert.equal(restored.player.action, null); assert.equal(s.player.action?.time, time);
    const hit = ready(240); hit.worker.stop = 0;
    hit.player.action = { kind, time: 0, connected: false };
    hit.worker.action = { kind: 'poke', time: moves.poke.windup - dt, connected: false };
    stepFight(hit, idleInput(), dt); assert.equal(hit.player.action, null); assert.equal(boxerPose(hit.player), 6);
  }
});

test('new editor poses update hurt zones atomically, reject invalid data and reset to chosen keys', () => {
  try {
    editCel('leadKick', 1, { pose: 19 }); assert.deepEqual(moves.leadKick.cels[1].hurt, boxerHurtByPose[19]);
    const saved = structuredClone(moves.leadKick.cels[1]);
    for (const pose of [-1, 25, .5, NaN]) assert.throws(() => editCel('leadKick', 1, { pose }), RangeError);
    assert.throws(() => editCel('poke', 1, { pose: 16 }), RangeError);
    assert.throws(() => editCel('rearKick', 2, { hit: [{ left: 55, bottom: 280, right: 366, top: 418 }] }), RangeError);
    assert.deepEqual(moves.leadKick.cels[1], saved);
  } finally { resetCels(); }
  assert.deepEqual(moves.leadKick.cels.map(c => c.pose), [16,17,16,0]);
  assert.deepEqual(moves.rearKick.cels.map(c => c.pose), [18,19,18,0]);
});

test('runtime hashes, registration and measured boot margins match the two author-approved previews', () => {
  const audit = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/kick-previews/runtime-assets.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json', import.meta.url), 'utf8'));
  assert.equal(audit.frames.length, 4); assert.equal(manifest.boxer.length, 25);
  for (const f of audit.frames) {
    const bytes = readFileSync(new URL(`../public/art/fight/boxer-${f.pose}.webp`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), f.runtime_sha256);
    assert.equal(f.rgba_matches_preview, true);
    assert.deepEqual(manifest.boxer[f.pose], { width: 640, height: 600, anchorX: 268, anchorY: 562, scale: 1.19 });
    assert.equal(f.source_commit, f.kind === 'leadKick' ? 'a95e18282615afbf730e2d03318ebf4e51790514' : 'f33bf59ed563de1fdee8e5c80deaa45192be9276');
    if (f.key === 'contact') {
      const hit = moves[f.kind as typeof kicks[number]].cels[1].hit[0];
      assert.ok(f.contact_padding >= 12 && f.contact_padding <= 24);
      assert.ok(Math.abs(hit.right - f.visible_tip - f.contact_padding) < 1e-8);
      assert.ok(hit.bottom <= f.visible_bottom && hit.top >= f.visible_top);
    }
  }
});
