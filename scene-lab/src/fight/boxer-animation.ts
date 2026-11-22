import { celAt } from './moves.ts';
import type { Fighter } from './model.ts';

export function boxerPose(f: Fighter): number {
  if (f.hp === 0 || f.reaction === 'down') return 11;
  if (f.reaction === 'guard') return f.crouch ? 5 : 4;
  if (f.reaction || f.hurt > 0) return 6;
  if (f.action) {
    const cel = celAt(f.action.kind, f.action.time).cel;
    return cel.phase === 'recovery' && cel.pose === 0 && f.crouch ? 5 : cel.pose;
  }
  if (f.dodge > 0) return 1;
  if (f.blocking) return f.crouch ? 5 : 4;
  if (f.crouch) return 5;
  if (f.y > 0) return 7;
  if (Math.abs(f.velocity) > 1) return Math.floor(f.travel / 67) % 2 ? 1 : 0;
  return 0;
}

export function jabFrame(f: Fighter): number | null {
  if (f.hp <= 0 || f.reaction || f.hurt > 0 || !f.action || f.action.kind !== 'jab' || f.y > 0) return null;
  const { cel, index, elapsed } = celAt('jab', f.action.time);
  if (cel.pose !== [0, 2, 0, 0][index] || cel.phase === 'recovery' && f.crouch) return null;
  const progress = cel.duration > 0 ? Math.min(1 - 1e-9, elapsed / cel.duration) : 0;
  if (index === 0) return Math.min(2, Math.floor(progress * 3 + 1e-9));
  if (index === 1) return 3;
  return (index === 2 ? 4 : 6) + Math.min(1, Math.floor(progress * 2 + 1e-9));
}
