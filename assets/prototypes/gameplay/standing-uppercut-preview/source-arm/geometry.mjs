import { solveTwoBone } from '../../../../../.claude/skills/video-reference-animation/scripts/retarget.mjs';

export const source = { shoulder: [114, 127], elbow: [141, 192], wrist: [179, 134] };
export const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const lengths = [distance(source.shoulder, source.elbow), distance(source.elbow, source.wrist)];
export const upperPolygon = [[78,92],[105,83],[128,96],[145,114],[150,137],[146,151],[156,176],[160,189],[149,202],[135,204],[116,188],[105,168],[93,150],[79,138],[75,116]];
export const forePolygon = [[132,183],[154,156],[170,133],[179,116],[188,102],[200,99],[210,104],[214,115],[212,127],[198,143],[186,162],[168,185],[152,200],[143,203],[134,198]];
export const contacts = [
  { name: 'c1-compact', shoulder: [138,121], target: [243,102] },
  { name: 'c2-balanced', shoulder: [140,119], target: [247,85] },
  { name: 'c3-high', shoulder: [140,119], target: [243,75] },
];
export function pose(shoulder, target) {
  const result = solveTwoBone(shoulder, target, lengths);
  if (result.clamped) throw new RangeError('Pose exceeds original arm reach');
  const d = distance(shoulder, result.wrist);
  const angle = Math.acos(Math.max(-1, Math.min(1, (lengths[0] ** 2 + lengths[1] ** 2 - d ** 2) / (2 * lengths[0] * lengths[1])))) * 180 / Math.PI;
  return { shoulder, elbow: result.elbow, wrist: result.wrist, angle };
}
export const preparation = pose([115,128], [178,145]);
export const drive = pose([124,122], [209,132]);
export const schedule = [
  { key: 'idle', duration: 600 },
  { key: 'preparation', duration: 40 },
  { key: 'drive', duration: 40 },
  { key: 'contact', duration: 120 },
  { key: 'drive', duration: 20 },
  { key: 'idle', duration: 700 },
];
