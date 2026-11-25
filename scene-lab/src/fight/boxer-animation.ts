import { celAt } from './moves.ts';
import type { Fighter } from './model.ts';

export const walkStride = 134;

export function canWalk(f: Fighter): boolean {
  return f.hp > 0 && !f.action && !f.reaction && f.hurt <= 0 && f.stun <= 0 && f.dodge <= 0 && !f.blocking && !f.crouch && f.y === 0;
}

export function walkFrame(f: Fighter): number | null {
  if (f.hp > 0 && !f.reaction && f.hurt <= 0 && f.y === 0 && f.action?.kind === 'counter') {
    const { cel, index, elapsed } = celAt('counter', f.action.time);
    if (index <= 1 && cel.pose === 0) {
      const frame = Math.min(3, Math.floor((elapsed / cel.duration + 1e-9) * 4));
      return index === 0 ? 3 - frame : frame;
    }
  }
  if (f.walk === null || !canWalk(f)) return null;
  return Math.min(3, Math.floor((f.walk + 1e-9) / (walkStride / 4)));
}

export function boxerPose(f: Fighter): number {
  if (f.hp === 0 || f.reaction === 'down') return 11;
  if (f.reaction === 'guard') return f.crouch ? 5 : 4;
  if (f.reaction || f.hurt > 0) return 6;
  if (f.action) {
    const cel = celAt(f.action.kind, f.action.time).cel;
    if (f.action.kind === 'heavy' && cel.pose === 12 && f.action.hand === 'right') return 13;
    return cel.phase === 'recovery' && cel.pose === 0 && f.crouch ? 5 : cel.pose;
  }
  if (f.dodge > 0) return 1;
  if (f.blocking) return f.crouch ? 5 : 4;
  if (f.crouch) return 5;
  if (f.y > 0) return 7;
  return 0;
}

export function jabFrame(f: Fighter): number | null {
  if (f.hp > 0 && !f.reaction && f.hurt <= 0 && f.y === 0 && f.action?.kind === 'ram') {
    const { cel, index } = celAt('ram', f.action.time);
    if (index === 0 && cel.pose === 0) return 0;
  }
  if (f.hp <= 0 || f.reaction || f.hurt > 0 || !f.action || f.action.kind !== 'jab' || f.y > 0) return null;
  const { cel, index, elapsed } = celAt('jab', f.action.time);
  if (cel.pose !== [0, 2, 0, 0][index] || cel.phase === 'recovery' && f.crouch) return null;
  const progress = cel.duration > 0 ? elapsed / cel.duration : 0;
  if (index === 0 && progress >= .5 - 1e-9) return 0;
  if (index === 2 && progress < .25 - 1e-9) return 1;
  return null;
}

export function crossFrame(f: Fighter): number | null {
  if (f.hp > 0 && !f.reaction && f.hurt <= 0 && f.y === 0 && (f.action?.kind === 'ram' || f.action?.kind === 'counter')) {
    const { cel, index } = celAt(f.action.kind, f.action.time);
    if (index === (f.action.kind === 'ram' ? 3 : 5) && cel.pose === 0) return 0;
  }
  if (f.hp <= 0 || f.reaction || f.hurt > 0 || !f.action || f.action.kind !== 'cross' || f.y > 0) return null;
  const { cel, index, elapsed } = celAt('cross', f.action.time);
  if (cel.pose !== [0, 3, 0, 0][index] || cel.phase === 'recovery' && f.crouch) return null;
  const progress = cel.duration > 0 ? elapsed / cel.duration : 0;
  if (index === 0 && progress >= 5 / 7 - 1e-9 || index === 2 && progress < .25 - 1e-9) return 0;
  return null;
}
