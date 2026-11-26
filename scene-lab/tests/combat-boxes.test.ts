import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { celAt, editCel, jabHurtByFrame, boxerHurtByPose, resetCels, strikeAt, type Attack } from '../src/fight/moves.ts';
import { createFight, idleInput, moves, stepFight } from '../src/fight/model.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';
const audit = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/jab-redraw/contact-audit.json', import.meta.url), 'utf8')) as { contacts: { kind: Attack; actor: string; pose: number; asset: string; sha256: string; visibleRight: number; visibleBottom: number; visibleTop: number }[] };

test('hero strikes extend beyond the measured fist while arm vulnerability stays inside it', () => {
  for (const c of audit.contacts.filter(c => c.actor !== 'worker')) {
    const bytes = readFileSync(new URL(`../public/art/fight/${c.asset}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), c.sha256, `${c.kind} measurements must match the actual texture`);
    const m = moves[c.kind], hit = m.cels[1].hit[0];
    assert.ok(hit.right - c.visibleRight >= 12 && hit.right - c.visibleRight <= (c.kind === 'heavy' ? 40 : 24), c.kind);
    assert.ok(hit.bottom <= c.visibleBottom && hit.top >= c.visibleTop, `${c.kind} must cover the fist vertically`);
    const arm = (c.kind === 'heavy' ? boxerHurtByPose[c.pose]! : m.cels[1].hurt).at(-1)!;
    assert.ok(arm.right <= c.visibleRight - 8, `${c.kind} arm must not become vulnerable in empty space`);
  }
});

test('all thirteen attacks have valid phase boxes, no contacts outside active frames, and mirrored world geometry', () => {
  for (const kind of Object.keys(moves) as Attack[]) {
    const m = moves[kind]; let time = 0;
    for (const cel of m.cels) {
      for (const b of [...cel.hit, ...cel.hurt]) {
        assert.ok([b.left, b.right, b.bottom, b.top].every(Number.isFinite));
        assert.ok(b.left < b.right && b.bottom < b.top, kind);
      }
      const f = createFight().player; f.x = 700; f.y = 50;
      f.action = { kind, time: time + cel.duration / 2, connected: false };
      const right = fighterGeometry(f); f.facing = -1; const left = fighterGeometry(f);
      for (const type of ['hurt', 'hit'] as const) for (let i = 0; i < right[type].length; i++) {
        assert.equal(left[type][i].left, 1400 - right[type][i].right);
        assert.equal(left[type][i].right, 1400 - right[type][i].left);
        assert.equal(left[type][i].top, right[type][i].top);
      }
      if (cel.phase !== 'active') { assert.equal(strikeAt(kind, f.action.time), -1); assert.equal(right.hit.length, 0); }
      time += cel.duration;
    }
  }
});

test('hybrid body boxes follow all four poses and recoil never keeps an active contact', () => {
  for (const facing of [1, -1] as const) for (const [time, hurt, active] of [
    [0, moves.jab.cels[0].hurt, false], [.04, jabHurtByFrame[0], false],
    [.08, moves.jab.cels[1].hurt, true], [.159999, moves.jab.cels[1].hurt, true],
    [.16, jabHurtByFrame[1], false], [.18, moves.jab.cels[2].hurt, false],
    [.24, moves.jab.cels[3].hurt, false],
  ] as const) {
    const f = createFight().player; f.x = 700; f.facing = facing; f.action = {kind: 'jab', time, connected: false};
    const g = fighterGeometry(f);
    assert.deepEqual(g.hurt, hurt.map(b => ({...b, left: 700 + (facing === 1 ? b.left : -b.right), right: 700 + (facing === 1 ? b.right : -b.left)})));
    assert.equal(g.hit.length, active ? 1 : 0);
  }
  const f = createFight().player; f.crouch = true; f.action = {kind: 'jab', time: .3, connected: false};
  assert.equal(Math.max(...fighterGeometry(f).hurt.map(b => b.top)), 265);
});

test('padded reach connects at the edge and misses immediately outside without repeated damage, mirrored', () => {
  for (const kind of ['jab', 'cross', 'heavy', 'low', 'upper', 'long', 'overhand', 'backfist'] as const) for (const facing of [1, -1] as const) for (const outside of [false, true]) {
    const s = createFight('street', true); s.phase = 'fighting'; s.player.x = 700; s.worker.x = 700 + facing * (moves[kind].range + (outside ? .1 : 0));
    s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1; s.worker.stop = 2;
    s.player.action = { kind, time: 0, connected: false };
    for (let i = 0; i < 120; i++) stepFight(s, idleInput(), 1/120);
    assert.equal(s.hits, outside ? 0 : 1, `${kind}, facing=${facing}, outside=${outside}`);
    assert.equal(s.worker.hp, outside ? 120 : 120 - moves[kind].damage);
  }
});

test('changing an editor pose updates body boxes atomically; reset restores the audited phase geometry', () => {
  const before = structuredClone(moves.heavy.cels[1]);
  try {
    editCel('heavy', 1, { pose: 8 }); assert.ok(moves.heavy.cels[1].hurt.some(b => b.right === 305));
    const edited = structuredClone(moves.heavy.cels[1]);
    assert.throws(() => editCel('heavy', 1, { pose: 21 }), RangeError); assert.deepEqual(moves.heavy.cels[1], edited);
  } finally { resetCels(); }
  assert.deepEqual(moves.heavy.cels[1], before);
  assert.equal(celAt('jab', .079).cel.phase, 'windup'); assert.equal(celAt('jab', .08).cel.phase, 'active');
});

test('worker tool tips stay outside vulnerable limbs and crouched sweep no longer has a standing head', () => {
  assert.ok(moves.sweep.cels[1].hit[0].right >= 430);
  assert.ok(Math.max(...moves.sweep.cels[1].hurt.map(b => b.top)) <= 335);
  assert.ok(Math.max(...moves.thrust.cels[1].hurt.map(b => b.right)) < 180);
  assert.equal(moves.spin.cels[1].hit[0].bottom, 125);
});

test('jab arm boxes follow the reference elbow and retract on the same clock as the drawings', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/jab-reference-animation/metadata.json', import.meta.url), 'utf8'));
  const tips = [184.45, 164.22];
  assert.equal(jabHurtByFrame.length, 2);
  for (let i = 0; i < tips.length; i++) {
    const arm = jabHurtByFrame[i].at(-1)!;
    const [x, y] = metadata.samples[[2, 12][i]].joints.e;
    assert.ok(Math.abs(arm.right - (tips[i] - 12)) < .01);
    assert.ok(arm.left <= (x - 164) * 1.19 && arm.right >= (x - 164) * 1.19);
    assert.ok(arm.bottom <= (495 - y) * 1.19 && arm.top >= (495 - y) * 1.19);
    assert.deepEqual(jabHurtByFrame[i].slice(0, 5), jabHurtByFrame[0].slice(0, 5));
  }
  assert.ok(jabHurtByFrame[1].at(-1)!.right < jabHurtByFrame[0].at(-1)!.right);
});

test('original straight-punch stance exposes both legs and leaves the low gap between them empty', () => {
  for (const kind of ['jab', 'long'] as const) for (const facing of [1, -1] as const) {
    const f = createFight().player; f.x = 700; f.facing = facing;
    f.action = {kind, time: moves[kind].windup, connected: false};
    const hurt = fighterGeometry(f).hurt;
    const contains = (offset: number) => hurt.some(b => b.left <= 700 + facing * offset && b.right >= 700 + facing * offset && b.bottom <= 70 && b.top >= 70);
    assert.equal(contains(0), false, `${kind} must not put a low hurt box in the empty centre`);
    assert.equal(contains(-140), true); assert.equal(contains(120), true);
  }
});
