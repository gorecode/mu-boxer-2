import { commandState, observeDirections, heavyCommand, lightCommand, kickCommand, type CommandState } from './commands.ts';
import { fighterGeometry, overlaps } from './geometry.ts';
import { canWalk, walkStride } from './boxer-animation.ts';

import { moves, celAt, heelSlideOffset, risingHop, strikeAt, strikeMove, type Attack, type Move } from './moves.ts';
export { moves, type Attack, type Move } from './moves.ts';
export type Outcome = 'win' | 'loss' | 'draw';
export type Phase = 'menu' | 'countdown' | 'fighting' | 'ending' | 'paused' | Outcome;
export const endingTiming = { fall: .7, ko: 1.1, fade: .55 } as const;
export interface Ending { result: Outcome; reason: 'ko' | 'time'; stage: 'fall' | 'ko' | 'fade'; elapsed: number }
export type Difficulty = 'warmup' | 'street';
export interface Input { left: boolean; right: boolean; down: boolean; block: boolean; jump: boolean; light: boolean; heavy: boolean; up?: boolean; dodge?: boolean; long?: boolean; overhand?: boolean; backfist?: boolean; ram?: boolean; counter?: boolean; leadKick?: boolean; rearKick?: boolean; doublePiston?: boolean; heelSlide?: boolean; attackPresses?: ('light' | NonNullable<Input['attackPressed']>)[]; attackPressed?: 'cross' | 'jab' | 'heavy' | 'low' | 'upper' | 'long' | 'overhand' | 'backfist' | 'ram' | 'counter' | 'rising' | 'leadKick' | 'rearKick' | 'doublePiston' | 'heelSlide' }
export const idleInput = (): Input => ({ left: false, right: false, down: false, block: false, jump: false, light: false, heavy: false });
export interface Fighter {
  x: number; y: number; vy: number; velocity: number; facing: 1 | -1;
  hp: number; maxHp: number; guard: number; crouch: boolean; blocking: boolean;
  guardDelay: number; dodge: number; dodgeCooldown: number; dodgeDirection: number; stun: number; invulnerable: number; action: { kind: Attack; time: number; connected: boolean; contacts?: number[]; result?: 'hit' | 'block'; opening?: 'hit' | 'block'; chain?: number; lunge?: number; hand?: 'left' | 'right' } | null;
  travel: number; walk: number | null; hurt: number; stop: number; knockback: number; reaction: Move['reaction'] | 'guard' | null;
}
export interface FightEvent { type: 'hit' | 'block' | 'break' | 'miss' | 'jump' | 'land' | 'start' | 'finish'; target: 'player' | 'worker'; x: number; y: number; power: number; attack?: Attack; direction?: number }
export interface Fight {
  phase: Phase; resume: 'countdown' | 'fighting' | 'ending'; difficulty: Difficulty; ending: Ending | null;
  player: Fighter; worker: Fighter; time: number; remaining: number; countdown: number;
  hitstop: number; aiWait: number; aiTurn: number; combo: number; comboTime: number;
  hits: number; blocked: number; events: FightEvent[];
  training: { enabled: boolean; dummy: 'idle' | 'guard' | 'after-hit' | 'cpu'; firstHit: boolean; gap: boolean };
  brain: { timer: number; decisions: number; intent: 'retreat' | 'guard' | 'attack' | 'punish' | 'wait';
    defendUntil: number; counter: boolean; stage: 1 | 2 | 3; stageTime: number; pressure: number; crouching: number; waiting: number;
    observedCrouch: boolean; observedClosing: boolean; observedIdle: boolean; response: 'thrust' | 'sweep' | 'spin' | null; low: boolean; observedAttack: Attack | null; observedDistance: number; recovering: boolean };
  comboQueue: Attack[]; commands: CommandState; lightHand: 'jab' | 'cross'; heavyHand: 'left' | 'right'; held: Input; buffered: { kind: Attack | 'jump' | 'dodge'; remaining: number } | null; comboActive: boolean;
}
function fighter(x: number, hp: number, facing: 1 | -1): Fighter {
  return { x, y: 0, vy: 0, velocity: 0, facing, hp, maxHp: hp, guard: 100, crouch: false, blocking: false,
    guardDelay: 0, dodge: 0, dodgeCooldown: 0, dodgeDirection: 0, stun: 0, invulnerable: 0, action: null, travel: 0, walk: null, hurt: 0, stop: 0, knockback: 0, reaction: null };
}
export function createFight(difficulty: Difficulty = 'street', training = false): Fight {
  return { phase: 'menu', resume: 'countdown', difficulty, ending: null, player: fighter(430, 100, 1), worker: fighter(1170, 120, -1),
    time: 0, remaining: 90, countdown: 1.6, hitstop: 0, aiWait: .65, aiTurn: 0, combo: 0, comboTime: 0, hits: 0, blocked: 0, events: [], training: { enabled: training, dummy: 'idle', firstHit: false, gap: false }, brain: { timer: difficulty === 'warmup' ? .24 : .10, decisions: 0, intent: 'wait', defendUntil: 0, counter: false, stage: 1, stageTime: 0, pressure: 0, crouching: 0, waiting: 0, observedCrouch: false, observedClosing: false, observedIdle: false, response: null, low: false, observedAttack: null, observedDistance: 740, recovering: false }, comboQueue: [], commands: commandState(), lightHand: 'jab', heavyHand: 'left', held: idleInput(), buffered: null, comboActive: false };
}
export function startFight(fight: Fight): void { if (fight.phase === 'menu') fight.phase = 'countdown'; }
export function pauseFight(fight: Fight): void {
  if (fight.phase === 'fighting' || fight.phase === 'countdown' || fight.phase === 'ending') {
    fight.resume = fight.phase; fight.phase = 'paused'; fight.comboQueue = []; fight.buffered = null; fight.held = idleInput(); fight.commands = commandState();
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
  if (f.action?.kind !== 'rising' && (f.y > 0 || f.vy > 0)) {
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
    if (f.action.kind === 'rising') {
      const before = f.y;
      f.y = risingHop(f.action.time); f.vy = 0;
      if (before === 0 && f.y > 0) emit(s, 'jump', name);
      if (before > 0 && f.y === 0) emit(s, 'land', name);
    }
    const m = moves[f.action.kind];
    if (f.action.kind === 'ram' && !f.action.contacts?.includes(0) && f.action.time - dt >= m.cels[0].duration + m.cels[1].duration - 1e-9) {
      f.action.time = Math.max(f.action.time, m.windup + m.active + m.cels[5].duration);
    }
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
const cancelTargets: Partial<Record<Attack, Attack[]>> = { jab: ['cross', 'heavy', 'backfist'], cross: ['heavy', 'backfist'], long: ['heavy'], heavy: ['upper'], low: ['upper'] };
function acceptAttack(s: Fight, requested: Attack | 'light' | 'jump' | 'dodge'): void {
  if (requested === 'jump' || requested === 'dodge') s.comboQueue = [];
  const a = s.player.action;
  const planned = s.comboQueue.at(-1) ?? (a ? undefined : s.buffered?.kind);
  const kind = requested === 'light' ? planned === 'jab' ? 'cross' : planned === 'cross' ? 'jab' : s.lightHand : requested;
  const previous = s.comboQueue.at(-1) ?? a?.kind ?? s.buffered?.kind;
  const slots = 2 - (a?.chain ?? 0);
  if (kind !== 'jump' && kind !== 'dodge' && previous && previous !== 'jump' && previous !== 'dodge' &&
    s.comboQueue.length < slots && cancelTargets[previous]?.includes(kind) &&
    (!a || a.result !== 'block' && a.time <= moves[a.kind].windup + moves[a.kind].active + .12)) {
    s.comboQueue.push(kind);
  } else {
    s.buffered = { kind, remaining: BUFFER_TIME };
  }
}
function readInput(s: Fight, input: Input, dt: number): void {
  if (s.buffered && s.player.stop <= 0) {
    s.buffered.remaining -= dt;
    if (s.buffered.remaining <= 0) s.buffered = null;
  }
  const a = s.player.action;
  if (input.block || s.player.stun > 0 || s.player.reaction ||
    a && (a.result === 'block' || a.time > moves[a.kind].windup + moves[a.kind].active + .12) ||
    !a && !s.buffered) s.comboQueue = [];
  observeDirections(s.commands, input, s.player.facing, s.time);
  let kind: Attack | 'jump' | 'dodge' | undefined;
  if (input.jump && !s.held.jump) kind = 'jump';
  const crouch = input.down && s.player.y === 0;
  if (input.light && !s.held.light) {
    const command = lightCommand(s.commands, input, s.player.facing, s.time, s.player.y === 0);
    kind = command === 'light' ? s.lightHand : command;
  }
  if (input.heavy && !s.held.heavy) kind = heavyCommand(s.commands, { ...input, down: crouch }, s.player.facing, s.time, s.player.y === 0);
  if (input.leadKick && !s.held.leadKick) kind = kickCommand(s.commands, input, s.player.facing, s.time, s.player.y === 0);
  for (const move of ['long', 'overhand', 'backfist', 'ram', 'counter', 'rearKick', 'doublePiston', 'heelSlide'] as const) if (input[move] && !s.held[move]) kind = move;
  if (input.attackPressed) kind = input.attackPressed;
  if (input.dodge && !s.held.dodge) kind = 'dodge';
  const presses = input.attackPresses?.slice(0, 3);
  if (kind === 'dodge') acceptAttack(s, kind);
  else if (presses?.length) { for (const press of presses) acceptAttack(s, press); }
  else if (kind) acceptAttack(s, kind);
  s.held = { ...input };
}
function control(s: Fight, input: Input, dt: number): void {
  const p = s.player;
  if (p.stun > 0 || p.reaction) { p.blocking = p.reaction === 'guard' && input.block && p.y === 0; if (p.reaction !== 'guard') p.crouch = false; return; }
  p.crouch = input.down && p.y === 0;
  p.blocking = input.block && p.y === 0 && !p.action;
  if (p.dodge > 0) { p.blocking = false; p.crouch = false; move(p, p.dodgeDirection * 500, dt); return; }
  const queued = !!p.action && s.comboQueue.length > 0;
  const requested = queued ? s.comboQueue[0] : s.buffered?.kind;
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
    } else if (p.y === 0 || !['long', 'overhand', 'backfist', 'ram', 'counter', 'rising', 'leadKick', 'rearKick', 'doublePiston', 'heelSlide'].includes(requested)) {
      const a = p.action;
      const cancel = a?.result === 'hit' && (a.chain ?? 0) < 2 &&
        a.time <= moves[a.kind].windup + moves[a.kind].active + .12 && cancelTargets[a.kind]?.includes(requested);
      if (!a || cancel) {
        const chain = cancel && a ? (a.chain ?? 0) + 1 : 0;
        const lunge = requested === 'upper' || requested === 'rising' ? 0 : cancel && p.y === 0 && s.worker.y === 0 && (s.worker.x - p.x) * p.facing > 0
          ? clamp(Math.abs(s.worker.x - p.x) + Math.abs(s.worker.knockback) / 12 - moves[requested].range + 20, 24, 120)
          : requested === 'long' && p.y === 0 && (s.worker.x - p.x) * p.facing > 0
            ? clamp(Math.abs(s.worker.x - p.x) - 220, 0, 110)
            : 0;
        if (requested === 'jab' || requested === 'cross') s.lightHand = requested === 'jab' ? 'cross' : 'jab';
        p.action = { kind: requested, time: 0, connected: false, chain, lunge };
        if (requested === 'heavy') {
          p.action.hand = s.heavyHand;
          s.heavyHand = s.heavyHand === 'left' ? 'right' : 'left';
        }
        p.blocking = false; p.velocity = 0;
        if (queued) s.comboQueue.shift();
        s.buffered = null;
      }
    }
  }
  if (p.action?.kind === 'rising' || p.action?.kind === 'leadKick' || p.action?.kind === 'rearKick' || p.action?.kind === 'doublePiston') p.crouch = false;
  if (p.action?.kind === 'heelSlide') {
    const time = p.action.time;
    p.crouch = celAt('heelSlide', time).cel.pose !== 0;
    move(p, p.facing * (heelSlideOffset(time) - heelSlideOffset(Math.max(0, time - dt))) / dt, dt);
    return;
  }
  if (p.action?.kind === 'ram' || p.action?.kind === 'counter') {
    p.crouch = false;
    const a = p.action, cels = moves[a.kind].cels;
    const end = (index: number) => cels.slice(0, index).reduce((sum, c) => sum + c.duration, 0);
    const progress = (t: number, from: number, to: number) => clamp((t - from) / (to - from), 0, 1);
    const offset = (t: number) => a.kind === 'counter'
      ? -80 * progress(t, 0, end(1)) + 160 * progress(t, end(1), end(3)) + 100 * progress(t, end(5), end(7))
      : 250 * progress(t, end(1), end(2)) + (a.opening === 'hit' ? 190 * progress(t, end(2), end(6)) : 0) + (a.contacts?.includes(0) ? 27 * progress(t, end(3), end(4)) : 0);
    const before = p.x, delta = offset(a.time) - offset(Math.max(0, a.time - dt));
    move(p, p.facing * delta / dt, dt);
    if (a.kind === 'ram' && a.opening === 'hit' && !a.contacts?.includes(1) && s.worker.stop <= 0 && s.worker.stun > 0 && s.worker.reaction !== 'down') {
      const push = 190 * (progress(a.time, end(2), end(6)) - progress(Math.max(0, a.time - dt), end(2), end(6)));
      move(s.worker, p.facing * Math.min(push, Math.max(0, (p.x - before) * p.facing)) / dt, dt);
    }
    return;
  }
  const direction = Number(input.right) - Number(input.left);
  const stepTime = (p.action?.chain ?? 0) > 0 ? .08 : p.action?.kind === 'long' ? .16 : .12;
  const follow = p.action && (p.action.lunge ?? 0) > 0 && p.action.time < stepTime;
  move(p, follow ? p.facing * p.action!.lunge! / stepTime : p.action || p.blocking || p.crouch ? 0 : direction * (p.y > 0 ? 245 : 355),
    follow ? Math.min(dt, stepTime - p.action!.time) : dt);
}
function ai(s: Fight, dt: number): void {
  const w = s.worker, p = s.player, brain = s.brain;
  if (w.reaction !== 'guard' || w.stun <= 0) { w.blocking = false; w.crouch = false; }
  w.velocity = 0;
  if (!s.training.enabled || s.training.dummy === 'cpu') {
    brain.timer -= dt;
    if (brain.timer <= 0) {
      const interval = s.difficulty === 'warmup' ? .24 : .10;
      brain.timer = interval; brain.decisions++;
      const distance = brain.observedDistance, recovering = brain.recovering;
      const accumulate = (value: number, condition: boolean) => clamp(value + (condition ? interval : -interval * 2), 0, 2);
      brain.pressure = accumulate(brain.pressure, brain.observedClosing && distance > 250 && distance < 650);
      brain.crouching = accumulate(brain.crouching, brain.observedCrouch && distance <= 430);
      brain.waiting = accumulate(brain.waiting, brain.observedIdle && distance > 320);
      brain.response = brain.crouching >= .5 ? 'sweep' : brain.pressure >= .35 ? 'thrust' : brain.waiting >= 1 ? 'spin' : null;
      const mistake = brain.decisions % (s.difficulty === 'warmup' ? 3 : 7) === 0;
      brain.intent = brain.observedAttack && !recovering && !mistake ? 'guard'
        : recovering && !mistake ? 'punish' : distance < 210 ? 'retreat' : distance > 320 ? 'wait' : 'attack';
      brain.low = !!brain.observedAttack && moves[brain.observedAttack].level === 'low';
      const action = p.action;
      brain.observedDistance = Math.abs(p.x - w.x);
      brain.observedAttack = action && action.time >= .06 ? action.kind : null;
      brain.recovering = !!action && action.time > moves[action.kind].windup + moves[action.kind].active;
      brain.observedCrouch = p.crouch;
      brain.observedClosing = !p.reaction && p.stun <= 0 && p.velocity * Math.sign(w.x - p.x) > 50;
      brain.observedIdle = Math.abs(p.velocity) < 20 && !p.action && !p.crouch && !p.reaction && p.stun <= 0;
    }
  }
  if (w.action) {
    if (w.action.kind === 'thrust') {
      const t = w.action.time, end = moves.thrust.windup;
      const travelTime = Math.max(0, Math.min(t, end) - Math.max(t - dt, end - .22));
      if (travelTime > 0) move(w, w.facing * 500, travelTime);
    }
    if (w.action.kind === 'spin') {
      const t = w.action.time, m = moves.spin;
      const travelTime = Math.max(0, Math.min(t, m.windup + m.active) - Math.max(t - dt, m.windup));
      if (travelTime > 0) move(w, w.facing * 720, travelTime);
    }
    return;
  }
  if (brain.stageTime > 0) { brain.stageTime = Math.max(0, brain.stageTime - dt); return; }
  if (w.stun > 0 || w.reaction || w.y > 0) return;
  if (s.training.enabled && s.training.dummy !== 'cpu') {
    w.blocking = s.training.dummy === 'guard' || s.training.dummy === 'after-hit' && s.training.firstHit;
    w.crouch = w.blocking && !!p.action && moves[p.action.kind].level === 'low';
    return;
  }
  s.aiWait -= dt;
  const stage = w.hp <= w.maxHp / 3 ? 3 : w.hp <= w.maxHp * 2 / 3 ? 2 : 1;
  if (stage > brain.stage) {
    brain.stage = stage; brain.stageTime = 1; brain.response = null;
    brain.pressure = 0; brain.crouching = 0; brain.waiting = 0;
    s.aiWait = .35; return;
  }
  const distance = Math.abs(p.x - w.x), sign = Math.sign(p.x - w.x);
  if (s.time >= brain.defendUntil) brain.counter = false;
  if (brain.counter && distance <= 320) { begin(w, 'poke'); brain.counter = false; s.aiWait = .45; return; }
  if (s.time < brain.defendUntil) brain.intent = 'guard';
  const response = brain.response;
  const responseInRange = response === 'spin' ? distance > 320 && distance <= 800
    : response === 'thrust' ? distance > 240 && distance <= 520 : response === 'sweep' && distance <= 345;
  if (s.aiWait <= 0 && response && responseInRange) {
    begin(w, response); brain.response = null; brain.pressure = 0; brain.crouching = 0; brain.waiting = 0;
    s.aiTurn++; s.aiWait = brain.stage === 3 ? 1.2 : brain.stage === 2 ? .3 : .6;
    return;
  }
  if (brain.intent === 'retreat' && distance < 210) move(w, -sign * 190, dt);
  else if (brain.intent === 'guard') { w.blocking = true; w.crouch = brain.low; }
  if (!w.blocking && brain.intent !== 'retreat' && s.aiWait <= 0 && distance <= 320 && brain.decisions >= 4) {
    const pattern: Attack[] = brain.stage === 2 ? ['poke', 'sweep', 'overhead', 'sweep'] : ['poke', 'overhead', 'poke', 'sweep'];
    begin(w, brain.intent === 'punish' ? 'poke' : pattern[s.aiTurn % pattern.length]); s.aiTurn++;
    s.aiWait = s.difficulty === 'warmup' ? 1.2 : brain.stage === 3 ? 1.4 : brain.stage === 2 ? .3 : .7;
  }
}
export function copyTraining(s: Fight): Fight {
  if (!s.training.enabled || s.phase !== 'fighting') throw new Error('Сохранение доступно только в активной тренировке.');
  const copy = structuredClone(s);
  copy.comboQueue = []; copy.commands = commandState(); copy.held = idleInput(); copy.buffered = null; copy.events = [];
  return copy;
}
interface Contact {
  from: 'player' | 'worker'; to: 'player' | 'worker'; kind: Attack; direction: 1 | -1;
  defended: boolean; strike: number; chain: number; continuing: boolean; x: number; y: number;
}
function contact(s: Fight, from: Contact['from'], to: Contact['to']): Contact | null {
  const a = s[from], b = s[to], attack = a.action;
  if (!attack || (attack.connected && attack.kind !== 'spin' && !moves[attack.kind].strikes) || a.stop > 0 || b.hp <= 0 || b.invulnerable > 0 || b.reaction === 'down') return null;
  const strike = strikeAt(attack.kind, attack.time);
  if (strike < 0 || attack.contacts?.includes(strike)) return null;
  const geometry = fighterGeometry(a), target = fighterGeometry(b);
  const hit = geometry.hit.find(h => target.hurt.some(b => overlaps(h, b)));
  if (!hit) return null;
  const m = moves[attack.kind];
  const facingAttacker = (a.x - b.x) * b.facing > 0;
  const defended = b.blocking && facingAttacker && (m.level === 'low' ? b.crouch : m.level === 'overhead' ? !b.crouch : true);
  const hurt = target.hurt.find(b => overlaps(hit, b))!;
  return { from, to, kind: attack.kind, direction: a.facing, defended, strike, chain: attack.chain ?? 0,
    continuing: s.comboActive && b.stun > 0, x: (Math.max(hit.left, hurt.left) + Math.min(hit.right, hurt.right)) / 2,
    y: (Math.max(hit.bottom, hurt.bottom) + Math.min(hit.top, hurt.top)) / 2 };
}
function applyContact(s: Fight, c: Contact): void {
  const a = s[c.from], b = s[c.to], m = strikeMove(c.kind, c.strike);
  if (a.action) { (a.action.contacts ??= []).push(c.strike); a.action.connected = true; a.action.result = c.defended ? 'block' : 'hit'; }
  if (a.action && (c.kind === 'ram' || c.kind === 'counter') && c.strike === 0) {
    a.action.opening = c.defended ? 'block' : 'hit';
    if (c.kind === 'ram') a.action.time = moves.ram.cels[0].duration + moves.ram.cels[1].duration;
  }
  const event = (type: FightEvent['type'], power: number) => s.events.push({
    type, target: c.to, x: c.x, y: c.y, power, attack: c.kind, direction: c.direction,
  });
  if (c.defended) {
    if (c.to === 'worker' && (!s.training.enabled || s.training.dummy === 'cpu')) { s.brain.counter = true; s.brain.defendUntil = s.time + .85; }
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
  b.hurt = .28; b.invulnerable = moves[c.kind].strikes && c.strike === 0 ? .06 : .19; b.action = null; b.blocking = false; b.crouch = false;
  b.reaction = m.reaction; b.knockback = c.direction * m.push * 12;
  if (m.lift) { b.vy = m.lift; b.y = Math.max(.1, b.y); }
  a.stop = Math.max(a.stop, m.stop[0]); b.stop = Math.max(b.stop, m.stop[1]);
  if (c.to === 'worker') {
    if (!s.training.enabled || s.training.dummy === 'cpu') { s.brain.defendUntil = s.time + .85; s.brain.intent = 'guard'; s.brain.observedAttack = c.kind; s.brain.low = m.level === 'low'; }
    if (s.training.enabled) s.training.firstHit = true;
    s.hits++; s.combo = c.continuing ? s.combo + 1 : 1; s.comboTime = 1.05; s.comboActive = true;
  } else { s.comboQueue = []; s.comboActive = false; s.combo = 0; }
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
  s.comboQueue = []; s.buffered = null; s.held = idleInput();
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
  const beforeWalk = s.player.x;
  const frozen = s.hitstop > 0;
  s.hitstop = Math.max(0, s.hitstop - dt);
  if (!frozen) { s.time += dt; if (!s.training.enabled) s.remaining = Math.max(0, s.remaining - dt); s.comboTime = Math.max(0, s.comboTime - dt); }
  const playerReady = body(s.player, dt, s, 'player'), workerReady = body(s.worker, dt, s, 'worker');
  if (s.worker.stun <= 0 && s.worker.stop <= 0) s.comboActive = false;
  if (playerReady) control(s, input, dt);
  if (workerReady) ai(s, dt);
  separate(s);
  if (playerReady) {
    const p = s.player, delta = p.x - beforeWalk;
    p.walk = canWalk(p) && Math.abs(p.velocity) > 1 && Math.abs(delta) > 1e-9
      ? (((p.walk ?? 0) + delta * p.facing) % walkStride + walkStride) % walkStride : null;
  }
  const contacts = [contact(s, 'player', 'worker'), contact(s, 'worker', 'player')];
  for (const c of contacts) if (c) applyContact(s, c);
  s.hitstop = Math.max(s.player.stop, s.worker.stop);
  separate(s); finish(s);
  if (!canWalk(s.player) || s.ending) s.player.walk = null;
}
