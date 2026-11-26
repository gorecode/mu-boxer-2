export type Attack = 'jab' | 'cross' | 'heavy' | 'low' | 'upper' | 'poke' | 'sweep' | 'overhead' | 'thrust' | 'spin' | 'long' | 'overhand' | 'backfist' | 'ram' | 'counter' | 'rising';
export interface Box { left: number; bottom: number; right: number; top: number }
export type CelPhase = 'windup' | 'active' | 'settle' | 'recovery';
export interface Cel { phase: CelPhase; duration: number; pose: number; hurt: Box[]; hit: Box[] }
export interface Move { cels: Cel[]; readonly windup: number; readonly active: number; readonly recovery: number; readonly range: number; damage: number; level: 'high' | 'mid' | 'low' | 'overhead'; push: number; hitstun: number; stop: [number, number]; reaction: 'light' | 'heavy' | 'launch' | 'down'; lift: number; strikes?: Partial<Pick<Move, 'damage' | 'push' | 'hitstun' | 'stop' | 'reaction' | 'lift'>>[] }
const box = (left: number, bottom: number, right: number, top: number): Box => ({ left, bottom, right, top });
export const standing = [box(-65, 0, 65, 180), box(-65, 180, 65, 450), box(-45, 450, 50, 570)];
export const crouching = [box(-65, 0, 65, 155), box(-55, 155, 75, 265)];
function move(timing: number[], poses: number[], height: number[], low: boolean, data: Omit<Move, 'cels' | 'windup' | 'active' | 'recovery'>): Move {
  const phases: CelPhase[] = ['windup', 'active', 'settle', 'recovery'];
  const cels = phases.map((phase, i): Cel => ({ phase, duration: timing[i], pose: poses[i], hurt: structuredClone(low ? crouching : standing), hit: [] }));
  cels[1].hit.push(box(55, height[0], data.range - 65, height[1]));
  return sequence(cels, data);
}
function sequence(cels: Cel[], data: Omit<Move, 'cels' | 'windup' | 'active' | 'recovery'>): Move {
  const sum = (from: number, to = cels.length) => cels.slice(from, to).reduce((n, c) => n + c.duration, 0);
  const first = () => cels.findIndex(c => c.phase === 'active'), last = () => cels.findLastIndex(c => c.phase === 'active');
  return { ...data, cels, get range() { return Math.max(0, ...cels.flatMap(c => c.hit.map(b => b.right))) + 65; },
    get windup() { return sum(0, first()); }, get active() { return sum(first(), last() + 1); }, get recovery() { return sum(last() + 1); } };
}
function cel(phase: CelPhase, duration: number, pose: number, hit: Box[] = []): Cel {
  return { phase, duration, pose, hit, hurt: structuredClone(standing) };
}
export const moves: Record<Attack, Move> = {
  jab: move([.08, .08, .08, .10], [0, 2, 0, 0], [420, 493], false, { range: 338, damage: 8, level: 'mid', push: 18, hitstun: .32, stop: [.04, .065], reaction: 'light', lift: 0 }),
  cross: move([.14, .09, .08, .12], [0, 3, 0, 0], [397, 469], false, { range: 310, damage: 9, level: 'mid', push: 22, hitstun: .32, stop: [.04, .065], reaction: 'light', lift: 0 }),
  heavy: move([.25, .12, .09, .19], [0, 12, 0, 0], [397, 525], false, { range: 243, damage: 20, level: 'mid', push: 60, hitstun: .42, stop: [.065, .09], reaction: 'heavy', lift: 0 }),
  low: move([.17, .1, .09, .15], [5, 8, 5, 5], [153, 223], true, { range: 403, damage: 10, level: 'low', push: 25, hitstun: .38, stop: [.04, .065], reaction: 'light', lift: 0 }),
  upper: move([.2, .12, .09, 0.31], [5, 9, 9, 0], [210, 548], true, { range: 288, damage: 23, level: 'overhead', push: 160, hitstun: .6, stop: [.07, .10], reaction: 'launch', lift: 620 }),
  rising: sequence([
    cel('windup', .04, 0), cel('windup', .04, 14), cel('active', .14, 15, [box(55, 400, 175, 540)]),
    cel('settle', .02, 14), cel('recovery', .30, 0),
  ], { range: 240, damage: 23, level: 'high', push: 160, hitstun: .6, stop: [.07, .10], reaction: 'launch', lift: 620 }),
  long: move([.23, .09, .1, .27], [0, 2, 0, 0], [435, 493], false, { range: 338, damage: 14, level: 'mid', push: 45, hitstun: .36, stop: [.05, .075], reaction: 'heavy', lift: 0 }),
  overhand: move([.38, .12, .12, .34], [4, 3, 0, 0], [205, 490], false, { range: 310, damage: 22, level: 'overhead', push: 45, hitstun: .65, stop: [.075, .10], reaction: 'down', lift: 0 }),
  backfist: move([.2, .1, .1, .32], [0, 3, 0, 0], [397, 469], false, { range: 310, damage: 18, level: 'high', push: 85, hitstun: .4, stop: [.065, .09], reaction: 'heavy', lift: 0 }),
  ram: sequence([
    cel('windup', .04, 0), cel('active', .32, 2, [box(55, 420, 273, 493)]),
    cel('settle', .06, 2), cel('settle', .04, 0), cel('active', .12, 3, [box(55, 397, 251, 469)]),
    cel('settle', .12, 3), cel('recovery', .26, 0),
  ], { range: 338, damage: 10, level: 'mid', push: 0, hitstun: .38, stop: [.02, .03], reaction: 'light', lift: 0,
    strikes: [{}, { damage: 18, push: 150, hitstun: .85, stop: [.065, .09], reaction: 'down', lift: 300 }] }),
  counter: sequence([
    cel('windup', .1, 0), cel('windup', .2, 0), cel('windup', .02, 3),
    cel('active', .08, 3, [box(55, 397, 245, 469)]), cel('settle', .02, 3), cel('settle', .04, 0),
    cel('settle', .02, 12), cel('active', .12, 12, [box(55, 397, 178, 525)]),
    cel('settle', .06, 12), cel('recovery', .24, 0),
  ], { range: 310, damage: 9, level: 'mid', push: 10, hitstun: .38, stop: [.025, .04], reaction: 'light', lift: 0,
    strikes: [{}, { damage: 16, push: 24, hitstun: .38, stop: [.045, .06], reaction: 'heavy' }] }),
  poke: move([.22, .12, .09, .21], [1, 2, 2, 7], [330, 410], false, { range: 320, damage: 12, level: 'high', push: 38, hitstun: .36, stop: [.045, .07], reaction: 'light', lift: 0 }),
  sweep: move([.5, .14, .09, .37], [7, 9, 9, 7], [0, 65], false, { range: 497, damage: 17, level: 'low', push: 65, hitstun: .65, stop: [.055, .085], reaction: 'down', lift: 0 }),
  thrust: move([.42, .13, .12, .65], [1, 2, 2, 7], [290, 420], false, { range: 340, damage: 14, level: 'mid', push: 55, hitstun: .38, stop: [.05, .075], reaction: 'heavy', lift: 0 }),
  spin: move([.65, .9, .16, .65], [3, 4, 1, 7], [125, 400], false, { range: 320, damage: 16, level: 'mid', push: 35, hitstun: .25, stop: [.035, .055], reaction: 'light', lift: 0 }),
  overhead: move([.6, .12, .09, .41], [3, 8, 8, 7], [0, 490], false, { range: 421, damage: 22, level: 'overhead', push: 65, hitstun: .5, stop: [.075, .1], reaction: 'heavy', lift: 0 }),
};
export function risingHop(time: number): number {
  const start = moves.rising.cels[0].duration;
  const end = moves.rising.cels.slice(0, -1).reduce((sum, c) => sum + c.duration, 0);
  if (time <= start || time >= end - 1e-9) return 0;
  const u = (time - start) / (end - start);
  return 48 * 4 * u * (1 - u);
}
export const boxerHurtByPose: Partial<Record<number, Box[]>> = {
  2: [box(-175, 0, -55, 220), box(45, 0, 170, 220), box(-80, 180, 55, 455), box(-10, 480, 60, 565), box(35, 430, 240, 480)],
  3: [box(-65, 0, 90, 180), box(-60, 180, 90, 450), box(15, 465, 95, 550), box(45, 410, 215, 450)],
  8: [box(-100, 0, 80, 110), box(-100, 100, 50, 275), box(20, 285, 100, 355), box(50, 160, 305, 210)],
  9: [box(-100, 0, 100, 150), box(-80, 170, 60, 345), box(-25, 345, 60, 480), box(40, 430, 190, 520)],
  12: [box(-245, 0, -120, 250), box(-50, 0, 145, 270), box(-160, 260, 50, 480), box(-100, 470, 10, 585), box(-100, 385, -20, 480), box(0, 435, 130, 525)],
  14: [box(-185, 0, -40, 270), box(-20, 0, 140, 270), box(-88, 270, 28, 480), box(-50, 470, 55, 585), box(15, 430, 60, 480), box(-10, 380, 75, 445), box(60, 400, 125, 520)],
  15: [box(-185, 0, -40, 270), box(-20, 0, 140, 270), box(-95, 270, 20, 480), box(-70, 470, 35, 585), box(0, 440, 55, 490), box(-10, 395, 75, 455), box(55, 415, 120, 540)],
  13: [box(-255, 0, -120, 250), box(-50, 0, 145, 270), box(-145, 260, 40, 480), box(-90, 470, 25, 585), box(-55, 355, 55, 475), box(0, 440, 145, 515)],
};
const workerHurtByPose: Partial<Record<number, Box[]>> = {
  2: [...standing, box(55, 335, 165, 400)],
  4: [box(-65, 0, 65, 180), box(-60, 180, 85, 405), box(-40, 405, 65, 480)],
  7: [box(-70, 0, 80, 150), box(-35, 140, 70, 340), box(45, 340, 110, 425)],
  8: [box(-65, 0, 65, 180), box(80, 0, 170, 180), box(-40, 180, 140, 380), box(105, 380, 175, 455)],
  9: [box(-140, 0, 120, 135), box(-20, 135, 185, 270), box(175, 270, 245, 335)],
};
function hurtForPose(kind: string, pose: number): Box[] {
  const worker = ['poke', 'sweep', 'overhead', 'thrust', 'spin'].includes(kind);
  return (worker ? workerHurtByPose : boxerHurtByPose)[pose] ?? (!worker && pose === 5 ? crouching : standing);
}
for (const [kind, m] of Object.entries(moves)) {
  for (const cel of m.cels) {
    cel.hurt = structuredClone(hurtForPose(kind, cel.pose));
  }
}
export const jabHurtByFrame: Box[][] = [
  [203.33, 122.58, 256.13, 156.01, 103.97, 184.45],
  [201.6, 124.75, 251.09, 161.82, 106.74, 164.22],
].map(([sx, sy, ex, ey, wy, tip]) => {
  const shoulder = [(sx - 164) * 1.19, (495 - sy) * 1.19];
  const elbow = [(ex - 164) * 1.19, (495 - ey) * 1.19];
  const wristY = (495 - wy) * 1.19;
  return [
    box(-175, 0, -25, 220), box(15, 0, 120, 225), box(-100, 220, 45, 450), box(-30, 470, 52, 575),
    box(35, 385, 95, 465),
    box(shoulder[0] - 10, Math.min(shoulder[1], elbow[1]) - 10, elbow[0] + 10, Math.max(shoulder[1], elbow[1]) + 10),
    box(elbow[0] - 10, Math.min(elbow[1], wristY) - 10, tip - 12, Math.max(elbow[1], wristY) + 14),
  ];
});
export const crossHurt = [
  box(-175, 0, -25, 220), box(15, 0, 120, 225), box(-110, 220, 40, 450), box(-35, 465, 65, 585),
  box(20, 345, 85, 405), box(-80, 385, 5, 460), box(-35, 390, 125, 470),
];
export const walkHurtByFrame: Box[][] = [
  [0, 0, 0, 0], [33.5, 4.76, 7.14, 0], [67, 9.52, 0, 0], [33.5, 4.76, 0, 5.95],
].map(([spread, drop, frontLift, rearLift]) => [
  box(-175 - spread, rearLift, -25 - spread / 2, 220 - drop / 2),
  box(15 + spread / 2, frontLift, 120 + spread, 225 - drop / 2),
  box(-65, 180 - drop, 65, 450 - drop), box(-45, 450 - drop, 50, 570 - drop),
]);
export function strikeAt(kind: Attack, time: number): number {
  if (kind === 'ram' || kind === 'counter') {
    const { cel, index } = celAt(kind, time);
    return cel.phase === 'active' ? moves[kind].cels.slice(0, index).filter(c => c.phase === 'active').length : -1;
  }
  const m = moves[kind], t = (time - m.windup) / m.active;
  if (t < -1e-9 || t >= 1 - 1e-9) return -1;
  if (kind !== 'spin') return 0;
  return t >= .15 - 1e-9 && t < .35 - 1e-9 ? 0 : t >= .65 - 1e-9 && t < .85 - 1e-9 ? 1 : -1;
}
export function strikeMove(kind: Attack, strike: number): Move {
  return { ...moves[kind], ...moves[kind].strikes?.[strike] };
}
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
  for (const kind of Object.keys(moves) as Attack[]) moves[kind].cels.splice(0, moves[kind].cels.length, ...structuredClone(defaults[kind]));
}
export function editCel(kind: Attack, index: number, patch: Partial<Pick<Cel, 'duration' | 'pose' | 'hit'>>): void {
  const cel = moves[kind]?.cels[index];
  if (!cel || (patch.duration !== undefined && (!Number.isFinite(patch.duration) || patch.duration < 1/120 || patch.duration > 2)) ||
    (patch.pose !== undefined && (!Number.isInteger(patch.pose) || patch.pose < 0 || patch.pose > (['poke', 'sweep', 'overhead', 'thrust', 'spin'].includes(kind) ? 11 : 15))) ||
    (patch.hit !== undefined && (cel.phase !== 'active' || patch.hit.length !== 1 || patch.hit.some(b =>
      ![b.left, b.right, b.bottom, b.top].every(Number.isFinite) || b.left < -600 || b.right > 600 || b.bottom < 0 || b.top > 800 || b.left >= b.right || b.bottom >= b.top)))) {
    throw new RangeError('Недопустимые параметры фазы.');
  }
  Object.assign(cel, structuredClone(patch));
  if (patch.pose !== undefined) cel.hurt = structuredClone(hurtForPose(kind, patch.pose));
}
