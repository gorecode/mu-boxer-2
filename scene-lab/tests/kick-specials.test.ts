import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { commandState, kickCommand, lightCommand, observeDirections } from '../src/fight/commands.ts';
import { createFight, copyTraining, idleInput, pauseFight, resumeFight, stepFight, type Fight, type Input } from '../src/fight/model.ts';
import { moves, celAt, editCel, resetCels, strikeAt, heelSlideOffset, boxerHurtByPose } from '../src/fight/moves.ts';
import { fighterGeometry, overlaps } from '../src/fight/geometry.ts';
import { boxerPose } from '../src/fight/boxer-animation.ts';

const dt = 1 / 120;
const kinds = ['doublePiston', 'heelSlide'] as const;
const kindOf = (s: Fight) => s.player.action?.kind;
function ready(distance = 240, facing: 1 | -1 = 1, wall = false) {
  const s = createFight('street', true); s.phase = 'fighting';
  s.worker.x = wall ? facing === 1 ? 1385 : 215 : facing === 1 ? 900 : 700;
  s.player.x = s.worker.x - facing * distance; s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
  return s;
}
function advance(s: Fight, seconds: number, input: Partial<Input> = {}) {
  const events: Fight['events'] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) { stepFight(s, { ...idleInput(), ...input }, dt); events.push(...s.events); }
  return events;
}
function command(s: Fight, kind: typeof kinds[number]) {
  const first = (kind === 'doublePiston' ? s.player.facing : -s.player.facing) === 1 ? 'right' : 'left';
  advance(s, .025, { [first]: true }); advance(s, .025);
  advance(s, .025, { [s.player.facing === 1 ? 'right' : 'left']: true }); advance(s, .025);
  advance(s, dt, { leadKick: true });
  assert.equal(s.player.action?.kind, kind);
}

test('kick motions mirror, accept release at the buffer boundary, expire and consume shared punch motions once', () => {
  for (const facing of [1, -1] as const) for (const kind of kinds) {
    const state = commandState(), first = (kind === 'doublePiston' ? facing : -facing) === 1 ? 'right' : 'left';
    const held = { ...idleInput(), [first]: true };
    observeDirections(state, held, facing, 0); observeDirections(state, held, facing, .1);
    assert.equal(kickCommand(state, held, facing, .1), 'leadKick');
    observeDirections(state, idleInput(), facing, .12);
    observeDirections(state, { ...idleInput(), [facing === 1 ? 'right' : 'left']: true }, facing, .28);
    observeDirections(state, idleInput(), facing, .30);
    const expired = structuredClone(state);
    assert.equal(kickCommand(state, idleInput(), facing, .53), kind);
    assert.equal(kickCommand(state, idleInput(), facing, .54), 'leadKick');
    assert.equal(lightCommand(state, idleInput(), facing, .54), 'light');
    assert.equal(kickCommand(expired, idleInput(), facing, .53001), 'leadKick');
    assert.equal(kickCommand(expired, idleInput(), facing, .3, false), 'leadKick');
    for (const conflict of [{ block: true }, { down: true }, { up: true }, { left: true, right: true }]) {
      assert.equal(kickCommand(expired, { ...idleInput(), ...conflict }, facing, .3), 'down' in conflict ? 'crouchKick' : 'leadKick');
      const interrupted = structuredClone(expired);
      observeDirections(interrupted, { ...idleInput(), ...conflict }, facing, .31);
      assert.equal(kickCommand(interrupted, idleInput(), facing, .32), 'leadKick');
    }
    observeDirections(expired, held, -facing, .4);
    assert.equal(kickCommand(expired, idleInput(), -facing, .41), 'leadKick');
  }
});

test('real directional inputs invoke both specials once; holding N does not repeat or change punch hands', () => {
  for (const facing of [1, -1] as const) for (const kind of kinds) {
    const s = ready(240, facing); command(s, kind);
    const events = advance(s, 1.8, { leadKick: true });
    assert.deepEqual(events.filter(e => e.type === 'hit').map(e => e.power), kind === 'doublePiston' ? [10,18] : [19]);
    assert.equal(s.player.action, null); assert.equal(s.worker.hp, kind === 'doublePiston' ? 92 : 101);
    assert.equal(s.lightHand, 'jab'); assert.equal(s.heavyHand, 'left');
    advance(s, dt); advance(s, dt, { leadKick: true }); assert.equal(kindOf(s), 'leadKick');
  }
});

test('double piston keeps the exact chosen drawing order and two independent contact windows', () => {
  const f = ready().player;
  for (const [time, pose, strike] of [[0,16,-1],[.079999,16,-1],[.08,17,0],[.199999,17,0],
    [.2,16,-1],[.24,0,-1],[.28,18,-1],[.359999,18,-1],[.36,19,1],[.519999,19,1],[.52,18,-1],[.56,0,-1]] as const) {
    f.action = { kind: 'doublePiston', time, connected: false };
    assert.equal(boxerPose(f), pose); assert.equal(strikeAt('doublePiston', time), strike);
    assert.equal(fighterGeometry(f).hit.length, strike < 0 ? 0 : 1);
  }
  assert.deepEqual(moves.doublePiston.cels.map(c => c.pose), [16,17,16,0,18,19,18,0]);
});

test('both piston contacts land from close to first-kick edge and at either wall without a knockdown or root step', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) for (const distance of [180,240,283]) {
    const s = ready(distance, facing, wall), x = s.player.x;
    advance(s, dt, { attackPressed: 'doublePiston' });
    let down = false; const hits: number[] = [];
    for (let i = 0; i < 180; i++) {
      hits.push(...advance(s, dt).filter(e => e.type === 'hit').map(e => e.power)); down ||= s.worker.reaction === 'down';
    }
    assert.deepEqual(hits, [10,18], `${facing}/${wall}/${distance}`);
    assert.equal(s.player.x, x); assert.equal(s.worker.hp, 92); assert.equal(down, false); assert.equal(s.worker.y, 0);
  }
});

test('piston first strike can whiff independently; the longer rear kick still reaches once', () => {
  const s = ready(350); advance(s, dt, { attackPressed: 'doublePiston' });
  const hits = advance(s, 1.4).filter(e => e.type === 'hit');
  assert.deepEqual(hits.map(e => e.power), [18]); assert.equal(s.worker.hp, 102);
});

test('slide matches approved grounded travel, has a low key and returns to crouch then idle', () => {
  assert.equal(heelSlideOffset(.08), 0); assert.equal(heelSlideOffset(.28), 160);
  assert.equal(heelSlideOffset(.56), 220); assert.equal(heelSlideOffset(2), 220);
  for (const facing of [1, -1] as const) {
    const s = ready(650, facing), x = s.player.x; advance(s, dt, { attackPressed: 'heelSlide' });
    advance(s, .3); assert.equal(boxerPose(s.player), 20); assert.equal(s.player.crouch, true);
    assert.equal(s.player.y, 0); assert.equal(s.player.vy, 0);
    advance(s, .3); assert.equal(boxerPose(s.player), 5);
    advance(s, .2); assert.equal(boxerPose(s.player), 0);
    advance(s, .5); assert.ok(Math.abs((s.player.x - x) * facing - 220) < 1e-6);
    assert.equal(s.hits, 0); assert.equal(s.player.action, null);
  }
});

test('slide hits only once across distances and walls, falls visibly and recovers without floor re-hits', () => {
  for (const facing of [1, -1] as const) for (const wall of [false, true]) for (const distance of [180,350,550]) {
    const s = ready(distance, facing, wall); advance(s, dt, { attackPressed: 'heelSlide' });
    let falling = false, landed = false;
    for (let i = 0; i < 240; i++) { advance(s, dt); falling ||= s.worker.reaction === 'down' && s.worker.y > 0; landed ||= falling && s.worker.y === 0; }
    assert.equal(s.hits, 1, `${facing}/${wall}/${distance}`); assert.equal(s.worker.hp, 101);
    assert.equal(falling, true); assert.equal(landed, true); assert.equal(s.worker.reaction, null);
    assert.ok(s.player.x >= 215 && s.player.x <= 1385); assert.ok(s.worker.x >= 215 && s.worker.x <= 1385);
  }
});

test('training guard blocks both piston contacts and crouch-blocks slide without health loss or falling', () => {
  for (const facing of [1, -1] as const) for (const kind of kinds) {
    const s = ready(240, facing); s.training.dummy = 'guard';
    advance(s, dt, { attackPressed: kind }); const events = advance(s, 1.5);
    assert.equal(s.worker.hp, 120); assert.equal(s.hits, 0);
    assert.equal(events.filter(e => e.type === 'block').length, kind === 'doublePiston' ? 2 : 1);
    assert.ok(s.worker.guard < 100); assert.equal(s.worker.y, 0); assert.notEqual(s.worker.reaction, 'down');
  }
});

test('CPU recognizes the new low level and a blocked slide leaves a real punishable recovery', () => {
  const cpu = ready(); cpu.training.enabled = false; cpu.aiWait = 999;
  Object.assign(cpu.brain, { timer: 0, decisions: 1, observedAttack: 'heelSlide', observedDistance: 240 });
  advance(cpu, dt, { attackPressed: 'heelSlide' });
  assert.equal(cpu.brain.intent, 'guard'); assert.equal(cpu.worker.blocking, true); assert.equal(cpu.worker.crouch, true);
  const blocked = ready(); blocked.training.dummy = 'guard'; advance(blocked, dt, { attackPressed: 'heelSlide' }); advance(blocked, .8);
  assert.equal(blocked.worker.hp, 120); assert.equal(blocked.player.action?.kind, 'heelSlide'); assert.equal(boxerPose(blocked.player), 0);
  blocked.worker.action = { kind: 'poke', time: moves.poke.windup, connected: false }; blocked.worker.blocking = false;
  advance(blocked, dt); assert.equal(blocked.player.hp, 88); assert.equal(blocked.player.action, null);
});

test('slide passes under a high shovel strike but remains vulnerable to low attacks; standing guard does not stop it', () => {
  for (const mode of ['high', 'low', 'high-guard', 'low-guard'] as const) {
    const s = ready(240); s.worker.stop = 10;
    s.player.action = { kind: 'heelSlide', time: .08, connected: false };
    if (mode.endsWith('guard')) { s.worker.blocking = true; s.worker.crouch = mode === 'low-guard'; }
    else s.worker.action = { kind: mode === 'high' ? 'poke' : 'sweep', time: moves[mode === 'high' ? 'poke' : 'sweep'].windup, connected: false };
    if (!mode.endsWith('guard')) s.worker.stop = 0;
    advance(s, dt);
    assert.equal(s.player.hp, mode === 'low' ? 83 : 100);
    if (mode === 'low') assert.equal(s.player.action, null);
    if (mode === 'high-guard') assert.equal(s.worker.hp, 101);
    if (mode === 'low-guard') { assert.equal(s.worker.hp, 120); assert.equal(s.player.action?.result, 'block'); }
  }
});

test('new hitboxes follow actual cels, padded boots and facing; endpoints hit exactly and recovery never does', () => {
  for (const kind of kinds) for (const facing of [1, -1] as const) {
    const f = ready().player; f.facing = facing; let t = 0;
    for (const c of moves[kind].cels) {
      f.action = { kind, time: t + c.duration / 2, connected: false };
      const g = fighterGeometry(f);
      if (c.phase === 'active') {
        const b = g.hit[0], edge = facing === 1 ? b.right : b.left;
        const target = { left: facing === 1 ? edge : edge - 10, right: facing === 1 ? edge + 10 : edge, bottom: b.bottom, top: b.top };
        assert.equal(overlaps(b, target), true); target.left += facing * .1; target.right += facing * .1;
        assert.equal(overlaps(b, target), false);
        if (kind === 'heelSlide') assert.ok(g.hurt.every(b => b.top <= 300));
      } else assert.equal(g.hit.length, 0);
      t += c.duration;
    }
  }
});

test('pause, hitstop and saved first piston hit preserve progression and do not duplicate contacts', () => {
  for (const kind of kinds) {
    const s = ready(); advance(s, dt, { attackPressed: kind });
    for (let i = 0; i < 120 && s.hits === 0; i++) advance(s, dt);
    assert.equal(s.hits, 1); const time = s.player.action!.time, x = s.player.x;
    advance(s, .025); assert.equal(s.player.action?.time, time); assert.equal(s.player.x, x);
    pauseFight(s); advance(s, .3); assert.equal(s.player.action?.time, time); assert.equal(s.player.x, x);
    resumeFight(s); const saved = copyTraining(s);
    advance(s, 1.5); advance(saved, 1.5);
    assert.equal(s.hits, kind === 'doublePiston' ? 2 : 1); assert.equal(s.worker.hp, saved.worker.hp);
    assert.equal(s.player.x, saved.player.x); assert.equal(s.player.action, null);
  }
});

test('air, held block, long stun and paused directions cannot leak specials after input expiry', () => {
  for (const kind of kinds) {
    for (const mode of ['air', 'block', 'stun'] as const) {
      const s = ready(); if (mode === 'air') { s.player.y = 500; s.player.vy = 400; }
      if (mode === 'stun') s.player.stun = .5;
      advance(s, .3, { [kind]: true, block: mode === 'block' }); assert.equal(s.player.action, null);
      advance(s, .9); assert.equal(s.player.action, null); assert.equal(s.hits, 0);
    }
    const s = ready(); advance(s, .025, { right: true }); advance(s, .025); pauseFight(s); resumeFight(s);
    advance(s, .025, { right: true }); advance(s, dt, { leadKick: true }); assert.equal(s.player.action?.kind, 'leadKick');
  }
});

test('incoming hits interrupt startup, and neither special hits behind, out of range or a downed/immune target', () => {
  for (const kind of kinds) {
    const interrupted = ready(); advance(interrupted, dt, { attackPressed: kind });
    interrupted.worker.action = { kind: 'overhead', time: moves.overhead.windup, connected: false };
    advance(interrupted, dt); assert.equal(interrupted.player.action, null); advance(interrupted, 1.5); assert.equal(interrupted.hits, 0);
    for (const mode of ['outside', 'behind', 'down', 'immune', 'air'] as const) {
      const s = ready(mode === 'outside' ? 700 : 240); s.worker.stop = 10;
      if (mode === 'behind') s.player.facing = -1;
      if (mode === 'down') s.worker.reaction = 'down';
      if (mode === 'immune') s.worker.invulnerable = 10;
      if (mode === 'air') s.worker.y = 500;
      advance(s, dt, { attackPressed: kind }); advance(s, 1.4);
      assert.equal(s.worker.hp, 120, `${kind}/${mode}`);
    }
  }
});

test('new editor key retains its hurt zones, validates max pose and resets without losing phases', () => {
  try {
    editCel('heelSlide', 1, { pose: 20, duration: .6 }); assert.deepEqual(moves.heelSlide.cels[1].hurt, boxerHurtByPose[20]);
    assert.equal(heelSlideOffset(.68), 220);
    assert.equal(celAt('doublePiston', .36).cel.pose, 19);
    assert.throws(() => editCel('heelSlide', 1, { pose: 27 }), RangeError);
    assert.throws(() => editCel('heelSlide', 2, { hit: [{ left: 55, right: 332, bottom: 0, top: 104 }] }), RangeError);
    assert.throws(() => editCel('poke', 1, { pose: 20 }), RangeError);
  } finally { resetCels(); }
  assert.deepEqual(moves.heelSlide.cels.map(c => c.pose), [5,20,5,0]); assert.equal(moves.heelSlide.active, .48);
});

test('lossless slide asset, original anchor and padded heel correspond to the selected GIF key', () => {
  const audit = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/kick-special-previews/runtime-assets.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json', import.meta.url), 'utf8'));
  const bytes = readFileSync(new URL('../public/art/fight/boxer-20.webp', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), audit.runtime_sha256);
  assert.equal(audit.rgba_matches_preview, true); assert.equal(audit.source_commit, '633cd547972788b450cb599f8dc56a72493d5c9f');
  assert.deepEqual(manifest.boxer[20], { width: 640, height: 600, anchorX: 268, anchorY: 556, scale: 1.19 });
  const hit = moves.heelSlide.cels[1].hit[0];
  assert.ok(audit.contact_padding >= 12 && audit.contact_padding <= 24);
  assert.ok(Math.abs(hit.right - audit.visible_tip - audit.contact_padding) < 1e-8);
  assert.ok(hit.bottom <= audit.visible_bottom && hit.top >= audit.visible_top);
});

test('both specials can finish a regular round through the visible fall, KO and result sequence', () => {
  for (const kind of kinds) {
    const s = ready(); s.training.enabled = false; s.brain.timer = 999; s.aiWait = 999;
    s.worker.hp = kind === 'doublePiston' ? 28 : 19;
    advance(s, dt, { attackPressed: kind });
    for (let i = 0; i < 180 && s.phase === 'fighting'; i++) advance(s, dt);
    assert.equal(s.hits, kind === 'doublePiston' ? 2 : 1); assert.equal(s.worker.hp, 0);
    assert.equal(s.phase, 'ending'); assert.equal(s.ending?.stage, 'fall');
    advance(s, 3); assert.equal(s.phase, 'win');
  }
});
