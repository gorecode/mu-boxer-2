export type Attack = 'jab' | 'heavy' | 'low' | 'upper' | 'poke' | 'sweep' | 'overhead';
export interface Box { left: number; bottom: number; right: number; top: number }
export type CelPhase = 'windup' | 'active' | 'settle' | 'recovery';
export interface Cel { phase: CelPhase; duration: number; pose: number; hurt: Box[]; hit: Box[] }
export interface Move { cels: Cel[]; readonly windup: number; readonly active: number; readonly recovery: number; readonly range: number; damage: number; level: 'high' | 'mid' | 'low' | 'overhead'; push: number; hitstun: number; stop: [number, number]; reaction: 'light' | 'heavy' | 'launch' | 'down'; lift: number }
const box = (left: number, bottom: number, right: number, top: number): Box => ({ left, bottom, right, top });
export const standing = [box(-65, 0, 65, 180), box(-65, 180, 65, 450), box(-45, 450, 50, 570)];
export const crouching = [box(-65, 0, 65, 155), box(-55, 155, 75, 265)];
function move(timing: number[], poses: number[], height: number[], low: boolean, data: Omit<Move, 'cels' | 'windup' | 'active' | 'recovery'>): Move {
  const phases: CelPhase[] = ['windup', 'active', 'settle', 'recovery'];
  const cels = phases.map((phase, i): Cel => ({ phase, duration: timing[i], pose: poses[i], hurt: structuredClone(low ? crouching : standing), hit: [] }));
  cels[1].hit.push(box(55, height[0], data.range - 65, height[1]));
  if (data.level === 'mid' && !low) cels[1].hurt.push(box(50, height[0], data.range - 77, height[1]));
  return { ...data, cels, get range() { return Math.max(0, cels[1].hit[0]?.right ?? 0) + 65; }, get windup() { return cels[0].duration; }, get active() { return cels[1].duration; }, get recovery() { return cels[2].duration + cels[3].duration; } };
}
export const moves: Record<Attack, Move> = {
  jab: move([.1, .09, .09, 0.09], [0, 2, 2, 0], [430, 500], false, { range: 320, damage: 8, level: 'mid', push: 18, hitstun: .32, stop: [.04, .065], reaction: 'light', lift: 0 }),
  heavy: move([.25, .12, .09, .19], [4, 3, 3, 0], [260, 370], false, { range: 250, damage: 20, level: 'mid', push: 60, hitstun: .42, stop: [.065, .09], reaction: 'heavy', lift: 0 }),
  low: move([.17, .1, .09, .15], [5, 8, 8, 0], [15, 110], true, { range: 235, damage: 10, level: 'low', push: 25, hitstun: .38, stop: [.04, .065], reaction: 'light', lift: 0 }),
  upper: move([.2, .12, .09, 0.31], [5, 9, 9, 0], [210, 455], true, { range: 250, damage: 23, level: 'overhead', push: 55, hitstun: .6, stop: [.07, .10], reaction: 'launch', lift: 620 }),
  poke: move([.3, .12, .09, .21], [1, 2, 2, 7], [330, 410], false, { range: 320, damage: 12, level: 'high', push: 38, hitstun: .36, stop: [.045, .07], reaction: 'light', lift: 0 }),
  sweep: move([.5, .14, .09, .37], [3, 9, 9, 7], [0, 65], false, { range: 345, damage: 17, level: 'low', push: 65, hitstun: .65, stop: [.055, .085], reaction: 'down', lift: 0 }),
  overhead: move([.6, .12, .09, .41], [3, 8, 8, 7], [240, 490], false, { range: 280, damage: 22, level: 'overhead', push: 65, hitstun: .5, stop: [.075, .1], reaction: 'heavy', lift: 0 }),
};
export function celAt(kind: Attack, time: number): { cel: Cel; index: number; elapsed: number } {
  const cels = moves[kind].cels;
  let elapsed = Math.max(0, time);
  for (let i = 0; i < cels.length; i++) {
    if (elapsed < cels[i].duration - 1e-9 || i === cels.length - 1) return { cel: cels[i], index: i, elapsed };
    elapsed -= cels[i].duration;
  }
  throw new RangeError('Missing move cels');
}
const defaults = Object.fromEntries(Object.entries(moves).map(([kind, m]) => [kind, structuredClone(m.cels)])) as Record<Attack, Cel[]>;
export function resetCels(): void {
  for (const kind of Object.keys(moves) as Attack[]) moves[kind].cels.splice(0, 4, ...structuredClone(defaults[kind]));
}
export function editCel(kind: Attack, index: number, patch: Partial<Pick<Cel, 'duration' | 'pose' | 'hit'>>): void {
  const cel = moves[kind]?.cels[index];
  if (!cel || (patch.duration !== undefined && (!Number.isFinite(patch.duration) || patch.duration < 1/120 || patch.duration > 2)) ||
    (patch.pose !== undefined && (!Number.isInteger(patch.pose) || patch.pose < 0 || patch.pose > 11)) ||
    (patch.hit !== undefined && (cel.phase !== 'active' || patch.hit.length !== 1 || patch.hit.some(b =>
      ![b.left, b.right, b.bottom, b.top].every(Number.isFinite) || b.left < -600 || b.right > 600 || b.bottom < 0 || b.top > 800 || b.left >= b.right || b.bottom >= b.top)))) {
    throw new RangeError('Недопустимые параметры фазы.');
  }
  Object.assign(cel, structuredClone(patch));
}
