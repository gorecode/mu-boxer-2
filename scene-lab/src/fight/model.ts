import { fighterGeometry, overlaps } from './geometry.ts';

import { moves, type Attack, type Move } from './moves.ts';
export { moves, type Attack, type Move } from './moves.ts';
export type Outcome = 'win' | 'loss' | 'draw';
export type Phase = 'menu' | 'countdown' | 'fighting' | 'ending' | 'paused' | Outcome;
export const endingTiming = { fall: .7, ko: 1.1, fade: .55 } as const;
export interface Ending { result: Outcome; reason: 'ko' | 'time'; stage: 'fall' | 'ko' | 'fade'; elapsed: number }
export type Difficulty = 'warmup' | 'street';
export interface Input { left: boolean; right: boolean; down: boolean; block: boolean; jump: boolean; light: boolean; heavy: boolean; dodge?: boolean; attackPressed?: 'jab' | 'heavy' | 'low' | 'upper' }
export const idleInput = (): Input => ({ left: false, right: false, down: false, block: false, jump: false, light: false, heavy: false });
export interface Fighter {
  x: number; y: number; vy: number; velocity: number; facing: 1 | -1;
  hp: number; maxHp: number; guard: number; crouch: boolean; blocking: boolean;
  guardDelay: number; dodge: number; dodgeCooldown: number; dodgeDirection: number; stun: number; invulnerable: number; action: { kind: Attack; time: number; connected: boolean; result?: 'hit' | 'block'; chain?: number; lunge?: number } | null;
  travel: number; hurt: number; stop: number; knockback: number; reaction: Move['reaction'] | 'guard' | null;
}
export interface FightEvent { type: 'hit' | 'block' | 'break' | 'miss' | 'jump' | 'land' | 'start' | 'finish'; target: 'player' | 'worker'; x: number; y: number; power: number; attack?: Attack; direction?: number }
export interface Fight {
  phase: Phase; resume: 'countdown' | 'fighting' | 'ending'; difficulty: Difficulty; ending: Ending | null;
  player: Fighter; worker: Fighter; time: number; remaining: number; countdown: number;
  hitstop: number; aiWait: number; aiTurn: number; combo: number; comboTime: number;
  hits: number; blocked: number; events: FightEvent[];
  training: { enabled: boolean; dummy: 'idle' | 'guard' | 'after-hit' | 'cpu'; firstHit: boolean; gap: boolean };
  brain: { timer: number; decisions: number; intent: 'approach' | 'retreat' | 'guard' | 'attack' | 'punish'; low: boolean; observedAttack: Attack | null; observedDistance: number; recovering: boolean };
  held: Input; buffered: { kind: Attack | 'jump' | 'dodge'; remaining: number } | null; comboActive: boolean;
}
function fighter(x: number, hp: number, facing: 1 | -1): Fighter {
  return { x, y: 0, vy: 0, velocity: 0, facing, hp, maxHp: hp, guard: 100, crouch: false, blocking: false,
    guardDelay: 0, dodge: 0, dodgeCooldown: 0, dodgeDirection: 0, stun: 0, invulnerable: 0, action: null, travel: 0, hurt: 0, stop: 0, knockback: 0, reaction: null };
}
export function createFight(difficulty: Difficulty = 'street', training = false): Fight {
  return { phase: 'menu', resume: 'countdown', difficulty, ending: null, player: fighter(430, 100, 1), worker: fighter(1170, 120, -1),
    time: 0, remaining: 90, countdown: 1.6, hitstop: 0, aiWait: .65, aiTurn: 0, combo: 0, comboTime: 0, hits: 0, blocked: 0, events: [], training: { enabled: training, dummy: 'idle', firstHit: false, gap: false }, brain: { timer: difficulty === 'warmup' ? .32 : .18, decisions: 0, intent: 'approach', low: false, observedAttack: null, observedDistance: 740, recovering: false }, held: idleInput(), buffered: null, comboActive: false };
}
export function startFight(fight: Fight): void { if (fight.phase === 'menu') fight.phase = 'countdown'; }
export function pauseFight(fight: Fight): void {
  if (fight.phase === 'fighting' || fight.phase === 'countdown' || fight.phase === 'ending') {
    fight.resume = fight.phase; fight.phase = 'paused'; fight.buffered = null; fight.held = idleInput();
    for (const f of [fight.player, fight.worker]) { f.blocking = false; f.velocity = 0; }
  }
}
export function resumeFight(fight: Fight): void { if (fight.phase === 'paused') fight.phase = fight.resume; }
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
function emit(s: Fight, type: FightEvent['type'], target: 'player' | 'worker', power = 0): void {
  const f = s[target]; s.events.push({ type, target, x: f.x, y: f.y, power });
}
function begin(f: Fighter, kind: Attack): void {
  if (!f.action && f.stun <= 0 && !f.reaction) { f.action = { kind, time: 0, connected: false }; f.blocking = false; f.velocity = 0; }
}
function body(f: Fighter, dt: number, s: Fight, name: 'player' | 'worker'): boolean {
  if (f.stop > 0) { f.stop = Math.max(0, f.stop - dt); return false; }
  f.stun = Math.max(0, f.stun - dt); f.invulnerable = Math.max(0, f.invulnerable - dt); f.hurt = Math.max(0, f.hurt - dt);
  f.guardDelay = Math.max(0, f.guardDelay - dt);
  if (f.guardDelay === 0 && !f.blocking && f.stun <= 0) f.guard = clamp(f.guard + dt * 27, 0, 100);
  f.dodge = Math.max(0, f.dodge - dt); f.dodgeCooldown = Math.max(0, f.dodgeCooldown - dt);
  if (f.y > 0 || f.vy > 0) {
    f.vy -= 1750 * dt; f.y = Math.max(0, f.y + f.vy * dt);
    if (f.y === 0) { f.vy = 0; emit(s, 'land', name); }
  }
  if (f.knockback) {
    move(f, f.knockback, dt); f.knockback *= Math.exp(-dt * 12);
    if (Math.abs(f.knockback) < 1) f.knockback = 0;
  }
  if (f.stun <= 0 && f.y === 0) f.reaction = null;
  if (f.action) {
    f.action.time += dt;
    const m = moves[f.action.kind];
    if (f.action.time >= m.windup + m.active + m.recovery) {
      if (!f.action.connected) emit(s, 'miss', name);
      f.action = null;
    }
  }
  return true;
}
function move(f: Fighter, velocity: number, dt: number): void {
  f.velocity = velocity;
  const before = f.x; f.x = clamp(f.x + velocity * dt, 215, 1385); f.travel += Math.abs(f.x - before);
}
const BUFFER_TIME = .12;
function readInput(s: Fight, input: Input, dt: number): void {
  if (s.buffered && s.player.stop <= 0) {
    s.buffered.remaining -= dt;
    if (s.buffered.remaining <= 0) s.buffered = null;
  }
  let kind: Attack | 'jump' | 'dodge' | undefined;
  if (input.jump && !s.held.jump) kind = 'jump';
  const crouch = input.down && s.player.y === 0;
  if (input.light && !s.held.light) kind = crouch ? 'low' : 'jab';
  if (input.heavy && !s.held.heavy) kind = crouch ? 'upper' : 'heavy';
  if (input.attackPressed) kind = input.attackPressed;
  if (input.dodge && !s.held.dodge) kind = 'dodge';
  if (kind) s.buffered = { kind, remaining: BUFFER_TIME };
  s.held = { ...input };
}
function control(s: Fight, input: Input, dt: number): void {
  const p = s.player;
  if (p.stun > 0 || p.reaction) { p.blocking = false; if (p.reaction !== 'guard') p.crouch = false; return; }
  p.crouch = input.down && p.y === 0;
  p.blocking = input.block && p.y === 0 && !p.action;
  if (p.dodge > 0) { p.blocking = false; p.crouch = false; move(p, p.dodgeDirection * 500, dt); return; }
  const requested = s.buffered?.kind;
  if (requested && !p.blocking) {
    if (requested === 'dodge') {
      if (p.y === 0 && !p.action && p.dodgeCooldown <= 0) {
        p.dodge = .18; p.dodgeCooldown = .65; p.dodgeDirection = -p.facing; p.invulnerable = Math.max(p.invulnerable, .08);
        p.crouch = false; s.buffered = null;
      }
    } else if (requested === 'jump') {
      if (p.y === 0 && !p.action) {
        p.vy = 950; p.y = .1; p.crouch = false; emit(s, 'jump', 'player'); s.buffered = null;
      }
    } else {
      const a = p.action;
      const allowed: Partial<Record<Attack, Attack[]>> = { jab: ['heavy'], heavy: ['upper'], low: ['upper'] };
      const cancel = a?.result === 'hit' && (a.chain ?? 0) < 2 &&
        a.time <= moves[a.kind].windup + moves[a.kind].active + .12 && allowed[a.kind]?.includes(requested);
      if (!a || cancel) {
        const chain = cancel && a ? (a.chain ?? 0) + 1 : 0;
        const lunge = cancel && p.y === 0 && s.worker.y === 0 && (s.worker.x - p.x) * p.facing > 0
          ? clamp(Math.abs(s.worker.x - p.x) + Math.abs(s.worker.knockback) / 12 - moves[requested].range + 20, 24, 120)
          : requested === 'upper' && p.y === 0 && (s.worker.x - p.x) * p.facing > 0
            ? clamp(Math.abs(s.worker.x - p.x) - moves.upper.range + 20, 0, 70) : 0;
        p.action = { kind: requested, time: 0, connected: false, chain, lunge };
        p.blocking = false; p.velocity = 0; s.buffered = null;
      }
    }
  }
  const direction = Number(input.right) - Number(input.left);
  const stepTime = (p.action?.chain ?? 0) > 0 ? .08 : .12;
  const follow = p.action && (p.action.lunge ?? 0) > 0 && p.action.time < stepTime;
  move(p, follow ? p.facing * p.action!.lunge! / stepTime : p.action || p.blocking || p.crouch ? 0 : direction * (p.y > 0 ? 245 : 355),
    follow ? Math.min(dt, stepTime - p.action!.time) : dt);
}
function ai(s: Fight, dt: number): void {
  const w = s.worker, p = s.player, brain = s.brain;
  w.blocking = false; w.crouch = false; w.velocity = 0;
  if (w.action || w.stun > 0 || w.reaction) return;
  if (s.training.enabled && s.training.dummy !== 'cpu') {
    w.blocking = s.training.dummy === 'guard' || s.training.dummy === 'after-hit' && s.training.firstHit;
    w.crouch = w.blocking && p.action?.kind === 'low';
    return;
  }
  s.aiWait -= dt; brain.timer -= dt;
  if (brain.timer <= 0) {
    brain.timer = s.difficulty === 'warmup' ? .32 : .18;
    brain.decisions++;
    const distance = brain.observedDistance, recovering = brain.recovering;
    const mistake = brain.decisions % (s.difficulty === 'warmup' ? 3 : 7) === 0;
    brain.intent = distance > 285 ? 'approach' : distance < 175 ? 'retreat'
      : brain.observedAttack && !recovering && !mistake ? 'guard' : recovering && !mistake ? 'punish' : 'attack';
    brain.low = brain.observedAttack === 'low';
    const action = p.action;
    brain.observedDistance = Math.abs(p.x - w.x);
    brain.observedAttack = action && action.time >= .06 ? action.kind : null;
    brain.recovering = !!action && action.time > moves[action.kind].windup + moves[action.kind].active;
  }
  const sign = Math.sign(p.x - w.x);
  if (brain.intent === 'approach' && Math.abs(p.x - w.x) > 280) move(w, sign * (s.difficulty === 'warmup' ? 115 : 160), dt);
  else if (brain.intent === 'retreat' && Math.abs(p.x - w.x) < 210) move(w, -sign * 100, dt);
  else if (brain.intent === 'guard') { w.blocking = true; w.crouch = brain.low; }
  if (!w.blocking && s.aiWait <= 0 && Math.abs(p.x - w.x) <= 340) {
    const pattern: Attack[] = ['poke', 'sweep', 'poke', 'overhead', 'sweep', 'overhead'];
    begin(w, brain.intent === 'punish' ? 'poke' : pattern[s.aiTurn % pattern.length]); s.aiTurn++;
    s.aiWait = s.difficulty === 'warmup' ? 1.2 : .46;
  }
}
export function copyTraining(s: Fight): Fight {
  if (!s.training.enabled || s.phase !== 'fighting') throw new Error('Сохранение доступно только в активной тренировке.');
  const copy = structuredClone(s);
  copy.held = idleInput(); copy.buffered = null; copy.events = [];
  return copy;
}
interface Contact {
  from: 'player' | 'worker'; to: 'player' | 'worker'; kind: Attack; direction: 1 | -1;
  defended: boolean; chain: number; continuing: boolean; x: number; y: number;
}
function contact(s: Fight, from: Contact['from'], to: Contact['to']): Contact | null {
  const a = s[from], b = s[to], attack = a.action;
  if (!attack || attack.connected || a.stop > 0 || b.hp <= 0 || b.invulnerable > 0) return null;
  const geometry = fighterGeometry(a), target = fighterGeometry(b);
  const hit = geometry.hit.find(h => target.hurt.some(b => overlaps(h, b)));
  if (!hit) return null;
  const m = moves[attack.kind];
  const facingAttacker = (a.x - b.x) * b.facing > 0;
  const defended = b.blocking && facingAttacker && (m.level === 'low' ? b.crouch : m.level === 'overhead' ? !b.crouch : true);
  const hurt = target.hurt.find(b => overlaps(hit, b))!;
  return { from, to, kind: attack.kind, direction: a.facing, defended, chain: attack.chain ?? 0,
    continuing: s.comboActive && b.stun > 0, x: (Math.max(hit.left, hurt.left) + Math.min(hit.right, hurt.right)) / 2,
    y: (Math.max(hit.bottom, hurt.bottom) + Math.min(hit.top, hurt.top)) / 2 };
}
function applyContact(s: Fight, c: Contact): void {
  const a = s[c.from], b = s[c.to], m = moves[c.kind];
  if (a.action) { a.action.connected = true; a.action.result = c.defended ? 'block' : 'hit'; }
  const event = (type: FightEvent['type'], power: number) => s.events.push({
    type, target: c.to, x: c.x, y: c.y, power, attack: c.kind, direction: c.direction,
  });
  if (c.defended) {
    b.guard = Math.max(0, b.guard - (m.damage + 13)); b.guardDelay = .65;
    if (s.training.enabled && c.to === 'worker' && s.training.firstHit) s.training.gap = true;
    s.blocked += c.to === 'player' ? 1 : 0;
    if (b.guard === 0) {
      b.blocking = false; b.stun = .8; b.action = null; b.hurt = .35; b.reaction = 'heavy';
      event('break', m.damage);
    } else { b.stun = .12; b.reaction = 'guard'; event('block', m.damage); }
    a.stop = Math.max(a.stop, .025); b.stop = Math.max(b.stop, .04);
    b.knockback = c.direction * 140;
    return;
  }
  const damage = Math.ceil(m.damage * (c.from === 'worker' && s.difficulty === 'warmup' ? .65 : 1) * (1 - c.chain * .15));
  b.hp = Math.max(s.training.enabled ? 1 : 0, b.hp - damage); b.stun = m.hitstun; b.dodge = 0;
  b.hurt = .28; b.invulnerable = .19; b.action = null; b.blocking = false; b.crouch = false;
  b.reaction = m.reaction; b.knockback = c.direction * m.push * 12;
  if (m.lift) { b.vy = m.lift; b.y = Math.max(.1, b.y); }
  a.stop = Math.max(a.stop, m.stop[0]); b.stop = Math.max(b.stop, m.stop[1]);
  if (c.to === 'worker') {
    if (s.training.enabled) s.training.firstHit = true;
    s.hits++; s.combo = c.continuing ? s.combo + 1 : 1; s.comboTime = 1.05; s.comboActive = true;
  } else { s.comboActive = false; s.combo = 0; }
  event('hit', damage);
}
function separate(s: Fight): void {
  const p = s.player, w = s.worker, delta = w.x - p.x;
  if (Math.abs(delta) < 140 && Math.abs(p.y - w.y) < 125) {
    const direction = delta >= 0 ? 1 : -1, middle = clamp((p.x + w.x) / 2, 285, 1315);
    p.x = middle - direction * 70; w.x = middle + direction * 70;
  }
  for (const [f, other] of [[p, w], [w, p]]) if (!f.action) f.facing = other.x >= f.x ? 1 : -1;
}
function finish(s: Fight): void {
  const p = s.player, w = s.worker;
  if (s.training.enabled || p.hp > 0 && w.hp > 0 && s.remaining > 0) return;
  const delta = p.hp / p.maxHp - w.hp / w.maxHp;
  s.ending = { result: delta > 0 ? 'win' : delta < 0 ? 'loss' : 'draw', reason: p.hp === 0 || w.hp === 0 ? 'ko' : 'time', stage: 'fall', elapsed: 0 };
  s.phase = 'ending';
  for (const f of [p, w]) {
    f.blocking = false; f.velocity = 0; f.crouch = false; f.dodge = 0;
    if (f.hp === 0) { f.action = null; f.y = Math.max(.1, f.y); f.vy = Math.max(420, f.vy); f.reaction = 'down'; }
  }
  s.buffered = null; s.held = idleInput();
}
function stepEnding(s: Fight, dt: number): void {
  const ending = s.ending!;
  const stopped = s.player.stop > 0 || s.worker.stop > 0;
  for (const [name, f] of [['player', s.player], ['worker', s.worker]] as const) {
    body(f, dt, s, name);
    if (f.hp === 0) f.reaction = 'down';
  }
  s.hitstop = Math.max(s.player.stop, s.worker.stop);
  if (stopped) return;
  ending.elapsed += dt;
  if (ending.stage === 'fall') {
    if (ending.elapsed < endingTiming.fall - 1e-9 || s.player.y > 0 || s.worker.y > 0) return;
    ending.stage = 'ko'; ending.elapsed = 0;
    emit(s, 'finish', ending.result === 'win' ? 'worker' : 'player');
  } else if (ending.stage === 'ko' && ending.elapsed >= endingTiming.ko - 1e-9) {
    ending.stage = 'fade'; ending.elapsed = 0;
  } else if (ending.stage === 'fade' && ending.elapsed >= endingTiming.fade - 1e-9) {
    ending.elapsed = endingTiming.fade; s.phase = ending.result;
    for (const f of [s.player, s.worker]) {
      f.action = null; f.velocity = 0; f.stop = 0; f.knockback = 0; f.reaction = f.hp === 0 ? 'down' : null;
    }
    s.hitstop = 0;
  }
}
export function stepFight(s: Fight, input: Input, dt: number): void {
  if (!Number.isFinite(dt) || dt < 0 || dt > .05) throw new RangeError('Fight step must be between 0 and 50 ms');
  s.events = [];
  if (!dt || s.phase === 'menu' || s.phase === 'paused' || s.phase === 'win' || s.phase === 'loss' || s.phase === 'draw') return;
  if (s.phase === 'ending') { stepEnding(s, dt); return; }
  if (s.phase === 'countdown') {
    s.countdown = Math.max(0, s.countdown - dt);
    if (!s.countdown) { s.phase = 'fighting'; emit(s, 'start', 'player'); }
    return;
  }
  readInput(s, input, dt);
  const frozen = s.hitstop > 0;
  s.hitstop = Math.max(0, s.hitstop - dt);
  if (!frozen) { s.time += dt; if (!s.training.enabled) s.remaining = Math.max(0, s.remaining - dt); s.comboTime = Math.max(0, s.comboTime - dt); }
  const playerReady = body(s.player, dt, s, 'player'), workerReady = body(s.worker, dt, s, 'worker');
  if (s.worker.stun <= 0 && s.worker.stop <= 0) s.comboActive = false;
  if (playerReady) control(s, input, dt);
  if (workerReady) ai(s, dt);
  separate(s);
  const contacts = [contact(s, 'player', 'worker'), contact(s, 'worker', 'player')];
  for (const c of contacts) if (c) applyContact(s, c);
  s.hitstop = Math.max(s.player.stop, s.worker.stop);
  separate(s); finish(s);
}
