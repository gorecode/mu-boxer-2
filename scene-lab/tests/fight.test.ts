import assert from 'node:assert/strict';
import { fighterGeometry, overlaps } from '../src/fight/geometry.ts';
import { test } from 'node:test';
import { createFight, idleInput, moves, pauseFight, resumeFight, startFight, stepFight, type Fight, type Input, type Attack } from '../src/fight/model.ts';

function advance(s: Fight, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds * 120); i++) stepFight(s, { ...idleInput(), ...input }, 1 / 120);
}
function ready(): Fight {
  const s = createFight(); startFight(s); advance(s, 1.7); s.aiWait = 999; s.brain.timer = 999;
  return s;
}
function actionKind(s: Fight): Attack | undefined { return s.player.action?.kind; }
function duel(): Fight { const s = ready(); s.player.x = 600; s.worker.x = 800; return s; }
function incoming(s: Fight, kind: Attack): void {
  s.worker.action = { kind, time: moves[kind].windup - .01, connected: false };
}

test('fight starts inert, counts down without damage, then allows input; restart is a fresh match', () => {
  const s = createFight('warmup'); advance(s, 2, { right: true, heavy: true });
  assert.equal(s.phase, 'menu'); assert.equal(s.player.x, 430); assert.equal(s.remaining, 90);
  startFight(s); advance(s, 1, { right: true, heavy: true });
  assert.equal(s.phase, 'countdown'); assert.equal(s.player.x, 430); assert.equal(s.worker.hp, 120);
  advance(s, .7); assert.equal(s.phase, 'fighting');
  const fresh = createFight('warmup'); assert.equal(fresh.player.hp, 100); assert.equal(fresh.worker.hp, 120); assert.equal(fresh.hits, 0);
});

test('movement respects both walls and solid bodies; opposing movement cancels; ground jump cannot double-jump', () => {
  const s = ready(); advance(s, 3, { left: true }); assert.equal(s.player.x, 215);
  advance(s, 1, { left: true, right: true }); assert.equal(s.player.x, 215);
  s.worker.x = 900; advance(s, 4, { right: true }); assert.ok(Math.abs(s.player.x - s.worker.x) >= 139.99);
  s.player.x = 1300; s.worker.x = 1000; advance(s, 1, { right: true }); assert.equal(s.player.x, 1385);
  stepFight(s, { ...idleInput(), jump: true }, 1 / 120); const initialVy = s.player.vy;
  advance(s, .2, { jump: true }); assert.ok(s.player.y > 0); assert.ok(s.player.vy < initialVy);
  advance(s, 1); assert.equal(s.player.y, 0); assert.equal(s.player.vy, 0);
  const arc = ready(); stepFight(arc, { ...idleInput(), jump: true }, 1/120);
  let apex = 0;
  for (let i = 0; i < 150; i++) { stepFight(arc, idleInput(), 1/120); apex = Math.max(apex, arc.player.y); }
  assert.ok(apex > 245 && apex < 265); assert.equal(arc.player.y, 0);
});

test('jab has startup, range, facing, recovery and one contact per swing', () => {
  const s = duel(); advance(s, .07, { light: true }); assert.equal(s.worker.hp, 120);
  advance(s, .08); assert.equal(s.worker.hp, 112); assert.equal(s.hits, 1);
  advance(s, .1); assert.equal(s.worker.hp, 112);
  advance(s, .2); assert.equal(s.player.action, null);
  const distant = duel(); distant.worker.x = 1000; advance(distant, .5, { light: true }); assert.equal(distant.worker.hp, 120);
  const wrong = duel(); wrong.player.action = { kind: 'jab', time: .11, connected: false }; wrong.player.facing = -1;
  advance(wrong, .04); assert.equal(wrong.worker.hp, 120);
  const edge = duel(); edge.worker.stop = .5; edge.worker.x = edge.player.x + moves.jab.range; advance(edge, .15, { light: true }); assert.equal(edge.worker.hp, 112);
  const outside = duel(); outside.worker.stop = .5; outside.worker.x = outside.player.x + moves.jab.range + .1; advance(outside, .15, { light: true }); assert.equal(outside.worker.hp, 120);
});

test('heavy and crouching attacks have distinct damage and recovery contracts', () => {
  for (const [input, damage, kind] of [
    [{ heavy: true }, 20, 'heavy'], [{ down: true, light: true }, 10, 'low'], [{ down: true, heavy: true }, 23, 'upper'],
  ] as const) {
    const s = duel(); advance(s, .35, input); assert.equal(s.worker.hp, 120 - damage, kind); assert.equal(s.player.action?.kind, kind);
  }
});

test('standing block stops high but not low; crouching block stops sweep but not overhead; no rear block', () => {
  for (const [kind, down, damage] of [['poke', false, 0], ['sweep', false, 17], ['sweep', true, 0], ['overhead', true, 22], ['overhead', false, 0]] as const) {
    const s = duel(); incoming(s, kind); advance(s, .05, { block: true, down });
    assert.equal(s.player.hp, 100 - damage, `${kind}, crouch=${down}`);
    if (!damage) { assert.equal(s.blocked, 1); assert.ok(s.player.guard < 100); }
  }
  const behind = duel(); behind.player.action = { kind: 'jab', time: 0, connected: false }; behind.player.facing = -1; incoming(behind, 'poke');
  advance(behind, .05, { block: true }); assert.equal(behind.player.hp, 88);
});

test('duck evades a high poke, jumping clears a sweep, and out-of-range attacks do no damage', () => {
  const duck = duel(); incoming(duck, 'poke'); advance(duck, .07, { down: true }); assert.equal(duck.player.hp, 100);
  const jump = duel(); jump.player.y = 90; jump.player.vy = 120; incoming(jump, 'sweep'); advance(jump, .07); assert.equal(jump.player.hp, 100);
  const far = duel(); far.worker.x = 1200; incoming(far, 'overhead'); advance(far, .07); assert.equal(far.player.hp, 100);
});

test('depleted guard breaks, cancels block and prevents immediate retaliation; guard recovers at rest', () => {
  const s = duel(); s.player.guard = 3; incoming(s, 'poke'); advance(s, .04, { block: true });
  assert.equal(s.player.hp, 100); assert.equal(s.player.guard, 0); assert.ok(s.player.stun > .7); assert.equal(s.player.blocking, false);
  advance(s, .15, { heavy: true }); assert.equal(s.player.action, null);
  advance(s, 2); assert.ok(s.player.guard > 20);
});

test('hit interrupts startup, grants bounded immunity and briefly freezes both fighters', () => {
  const s = duel(); s.player.action = { kind: 'heavy', time: .01, connected: false }; incoming(s, 'poke');
  advance(s, .03); assert.equal(s.player.action, null); assert.equal(s.player.hp, 88); assert.ok(s.hitstop > 0);
  const remaining = s.remaining; advance(s, .02); assert.equal(s.remaining, remaining);
  incoming(s, 'poke'); advance(s, .08); assert.equal(s.player.hp, 88);
  advance(s, .5); incoming(s, 'poke'); advance(s, .05); assert.equal(s.player.hp, 76);
});

test('pause freezes timer, physics and startup; resume requires explicit action', () => {
  const s = duel(); advance(s, .05, { heavy: true }); pauseFight(s);
  const before = JSON.stringify({ player: s.player, worker: s.worker, remaining: s.remaining });
  advance(s, 3, { right: true, light: true }); assert.equal(s.phase, 'paused');
  assert.equal(JSON.stringify({ player: s.player, worker: s.worker, remaining: s.remaining }), before);
  resumeFight(s); advance(s, .4); assert.equal(s.worker.hp, 100);
  const countdown = createFight(); startFight(countdown); pauseFight(countdown); resumeFight(countdown); assert.equal(countdown.phase, 'countdown');
});

test('AI approaches and uses different attacks; warmup reduces incoming damage', () => {
  const s = ready(); s.aiWait = 0; s.brain.timer = .18; const kinds = new Set<string>();
  for (let i = 0; i < 120*9; i++) { stepFight(s, { ...idleInput(), block: true }, 1/120); if (s.worker.action) kinds.add(s.worker.action.kind); }
  assert.ok(s.worker.x < 1170); assert.ok(kinds.has('poke')); assert.ok(kinds.has('sweep'));
  const easy = duel(); easy.difficulty = 'warmup'; incoming(easy, 'poke'); advance(easy, .05); assert.equal(easy.player.hp, 92);
});

test('actual attacks can win and lose; terminal states freeze; timeout compares health fractions and supports draw', () => {
  const win = duel(); win.worker.hp = 8; win.player.y = 80; win.player.vy = 200;
  advance(win, .3, { light: true }); assert.equal(win.phase, 'ending');
  assert.ok(win.player.y > 0); assert.ok(win.worker.y > 0); advance(win, 3); assert.equal(win.phase, 'win');
  assert.equal(win.player.y, 0); assert.equal(win.player.vy, 0);
  assert.equal(win.worker.hp, 0); const remaining = win.remaining; advance(win, 2, { light: true }); assert.equal(win.remaining, remaining);
  const loss = duel(); loss.player.hp = 12; loss.player.y = 80; loss.player.vy = 200;
  incoming(loss, 'poke'); advance(loss, .1); assert.equal(loss.phase, 'ending'); assert.equal(loss.player.hp, 0);
  assert.ok(loss.player.y > 0); advance(loss, 3); assert.equal(loss.phase, 'loss');
  assert.equal(loss.player.y, 0); assert.equal(loss.player.vy, 0);
  for (const [hp, enemyHp, expected] of [[80, 60, 'win'], [40, 96, 'loss'], [50, 60, 'draw']] as const) {
    const s = duel(); s.player.hp = hp; s.worker.hp = enemyHp; s.remaining = .01; advance(s, .03); assert.equal(s.phase, 'ending'); assert.equal(s.ending?.result, expected); assert.equal(s.remaining, 0);
    advance(s, 3); assert.equal(s.phase, expected);
  }
});

test('simulation rejects invalid time and a zero step changes no combat state', () => {
  const s = duel();
  for (const dt of [NaN, Infinity, -.1, .051]) assert.throws(() => stepFight(s, idleInput(), dt), RangeError);
  const before = JSON.stringify(s); stepFight(s, idleInput(), 0); assert.equal(JSON.stringify(s), before);
});

test('attacks use press edges; holding produces one swing and re-press produces another', () => {
  const s = duel(); advance(s, 1.1, { light: true }); assert.equal(s.hits, 1); assert.equal(s.player.action, null);
  s.worker.x = s.player.x + 200; advance(s, .02); advance(s, .2, { light: true }); assert.equal(s.hits, 2);
});

test('120ms buffer survives release and hitstop but expires during a long recovery', () => {
  const s = ready(); s.player.action = { kind: 'heavy', time: moves.heavy.windup + moves.heavy.active + moves.heavy.recovery - .04, connected: false };
  stepFight(s, { ...idleInput(), light: true }, 1/120);
  assert.equal(s.player.action?.kind, 'heavy'); assert.equal(s.buffered?.kind, 'jab');
  advance(s, .06);
  assert.equal(s.player.action?.kind, 'jab'); assert.equal(s.buffered, null);
  const expired = ready(); advance(expired, .02, { heavy: true });
  advance(expired, .02, { light: true }); advance(expired, .9);
  assert.equal(expired.player.action, null); assert.equal(expired.buffered, null);
  const stopped = ready(); stopped.player.stop = .2; stopped.hitstop = .2;
  stepFight(stopped, { ...idleInput(), heavy: true }, 1/120); advance(stopped, .15);
  assert.equal(stopped.player.action, null); assert.equal(stopped.buffered?.kind, 'heavy');
  advance(stopped, .08); assert.equal(actionKind(stopped), 'heavy');
});

test('jump buffers before landing; pause and a fresh match discard pending attacks', () => {
  const s = ready(); s.player.y = 5; s.player.vy = -100;
  stepFight(s, { ...idleInput(), jump: true }, 1/120); advance(s, .08);
  assert.ok(s.player.y > 10); assert.ok(s.player.vy > 0);
  const paused = ready(); paused.player.stun = .06;
  stepFight(paused, { ...idleInput(), heavy: true }, 1/120); assert.equal(paused.buffered?.kind, 'heavy');
  pauseFight(paused); resumeFight(paused); advance(paused, .15);
  assert.equal(paused.player.action, null); assert.equal(paused.buffered, null); assert.equal(createFight().buffered, null);
});

test('hit-only cancels form a real jab-heavy-upper combo with scaling, lunge and launch', () => {
  const s = duel(); advance(s, .12, { light: true }); assert.equal(s.hits, 1);
  advance(s, .02, { heavy: true }); assert.equal(s.buffered?.kind, 'heavy');
  advance(s, .29); assert.equal(s.player.action?.kind, 'heavy'); assert.equal(s.hits, 2); assert.equal(s.combo, 2);
  assert.equal(s.worker.hp, 95);
  advance(s, .02, { down: true, heavy: true }); advance(s, .34);
  assert.equal(s.player.action?.kind, 'upper'); assert.equal(s.combo, 3); assert.equal(s.hits, 3);
  assert.equal(s.worker.hp, 78); assert.equal(s.worker.reaction, 'launch'); assert.ok(s.worker.y > 0);
  assert.ok(s.player.x > 630);
  advance(s, 1.4); assert.equal(s.comboActive, false); assert.equal(s.worker.y, 0); assert.equal(s.worker.reaction, null);
});

test('whiff and block cannot cancel; unsupported and repeated chain moves cannot cancel either', () => {
  const miss = ready(); advance(miss, .15, { light: true }); advance(miss, .02, { heavy: true });
  advance(miss, .14); assert.equal(miss.player.action?.kind, 'jab'); advance(miss, .15); assert.equal(miss.player.action, null);
  const block = duel(); block.player.action = { kind: 'jab', time: .11, connected: true, result: 'block' };
  advance(block, .02, { heavy: true }); assert.equal(block.player.action?.kind, 'jab');
  for (const requested of [{ light: true }, { down: true, light: true }, { down: true, heavy: true }]) {
    const s = duel(); s.player.action = { kind: 'jab', time: .11, connected: true, result: 'hit' };
    advance(s, .02, requested); assert.equal(s.player.action?.kind, 'jab');
  }
  const capped = duel(); capped.player.action = { kind: 'heavy', time: .26, connected: true, result: 'hit', chain: 2 };
  advance(capped, .02, { down: true, heavy: true }); assert.equal(capped.player.action?.kind, 'heavy');
});

test('separate hits after recovery start a new combo', () => {
  const s = duel(); advance(s, .13, { light: true }); advance(s, .7);
  assert.equal(s.comboActive, false); s.worker.x = s.player.x + 200;
  advance(s, .16, { light: true }); assert.equal(s.hits, 2); assert.equal(s.combo, 1);
});

test('simultaneous active attacks trade in either orientation and can cause a double knockout', () => {
  for (const facing of [1, -1] as const) {
    const s = duel(); s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1;
    s.worker.x = s.player.x + facing * 160;
    for (const f of [s.player, s.worker]) { f.hp = 8; f.action = { kind: 'jab', time: .11, connected: false }; }
    stepFight(s, idleInput(), 1/120);
    assert.equal(s.player.hp, 0); assert.equal(s.worker.hp, 0); assert.equal(s.phase, 'ending'); assert.equal(s.ending?.result, 'draw');
    assert.equal(s.events.filter(e => e.type === 'hit').length, 2);
    advance(s, 3); assert.equal(s.phase, 'draw');
  }
});

test('impact stops fighters independently, locates the contact and recovers from a sweep', () => {
  const s = duel(); advance(s, .12, { light: true });
  assert.ok(s.worker.stop > s.player.stop); const heldTime = s.player.action!.time;
  advance(s, .025); assert.equal(s.player.action!.time, heldTime);
  advance(s, .025); assert.ok(s.player.action!.time > heldTime); assert.ok(s.worker.stop > 0);
  const swept = duel(); incoming(swept, 'sweep');
  let contact: Fight['events'][number] | undefined;
  for (let i = 0; i < 8; i++) { stepFight(swept, idleInput(), 1/120); contact ??= swept.events.find(e => e.type === 'hit'); }
  assert.ok(contact); assert.equal(contact.attack, 'sweep'); assert.ok(contact.y >= 0 && contact.y <= 65);
  assert.equal(swept.player.reaction, 'down'); assert.ok(swept.player.knockback < 0);
  advance(swept, 1); assert.equal(swept.player.reaction, null); assert.equal(swept.player.stun, 0);
});

test('pose boxes follow facing and height, disappear outside active frames, and expose the extended arm', () => {
  const s = duel(), p = s.player;
  p.action = { kind: 'jab', time: .099, connected: false };
  assert.equal(fighterGeometry(p).hit.length, 0);
  p.action.time = .11;
  const right = fighterGeometry(p);
  assert.equal(right.hit.length, 1); assert.equal(right.hurt.length, 4);
  assert.equal(right.hit[0].right, 855);
  p.facing = -1; const left = fighterGeometry(p);
  assert.equal(left.hit[0].left, 345); assert.equal(left.hit[0].right, 545);
  p.y = 100; assert.equal(fighterGeometry(p).hit[0].top, left.hit[0].top + 100);
  p.action.time = .19; assert.equal(fighterGeometry(p).hit.length, 0);
  p.action = null; p.crouch = true; p.y = 0;
  assert.equal(Math.max(...fighterGeometry(p).hurt.map(b => b.top)), 265);
  p.crouch = false; p.reaction = 'down'; assert.equal(fighterGeometry(p).hurt[0].top, 85);
  const a = { left: 0, bottom: 0, right: 10, top: 10 };
  assert.equal(overlaps(a, { left: 10, bottom: 2, right: 20, top: 8 }), true);
  assert.equal(overlaps(a, { left: 10.001, bottom: 2, right: 20, top: 8 }), false);
  assert.equal(overlaps(a, { left: 2, bottom: 10.001, right: 8, top: 20 }), false);
});

test('buffer executes just before recovery but cannot wait beyond 120ms; explicit browser press survives held state', () => {
  for (const [stun, expected] of [[.1, 'jab'], [.15, undefined]] as const) {
    const s = ready(); s.player.stun = stun;
    stepFight(s, { ...idleInput(), light: true }, 1/120); advance(s, .2);
    assert.equal(s.player.action?.kind, expected);
  }
  const s = duel(); s.held.heavy = true;
  stepFight(s, { ...idleInput(), heavy: true, attackPressed: 'heavy' }, 1/120);
  assert.equal(s.player.action?.kind, 'heavy');
});

test('airborne down input does not select grounded crouching attacks', () => {
  for (const [button, expected] of [['light', 'jab'], ['heavy', 'heavy']] as const) {
    const s = ready(); s.player.y = 120; s.player.vy = 100;
    stepFight(s, { ...idleInput(), down: true, [button]: true }, 1/120);
    assert.equal(s.player.action?.kind, expected); assert.equal(s.player.crouch, false);
  }
});


test('jab reaches the drawn fist at 300px in either facing and respects contact boundaries', () => {
  for (const facing of [1, -1] as const) {
    for (const [distance, hp] of [[300, 112], [320, 112], [320.1, 120]] as const) {
      const s = ready(); s.player.x = 800; s.worker.x = 800 + facing * distance;
      s.player.facing = facing; s.worker.facing = facing === 1 ? -1 : 1; s.worker.stop = .5;
      advance(s, .15, { light: true });
      assert.equal(s.worker.hp, hp, `facing=${facing}, distance=${distance}`);
      advance(s, .1); assert.equal(s.worker.hp, hp, 'one contact per swing');
    }
  }
  const duck = duel(); duck.worker.crouch = true; duck.worker.stop = .5;
  advance(duck, .15, { light: true }); assert.equal(duck.worker.hp, 120);
  const immune = duel(); immune.worker.invulnerable = .5;
  advance(immune, .15, { light: true }); assert.equal(immune.worker.hp, 120);
  const s = duel(); s.player.action = { kind: 'jab', time: .11, connected: false };
  const hit = fighterGeometry(s.player).hit[0];
  assert.deepEqual(hit, { left: 655, right: 855, bottom: 430, top: 500 });
});
