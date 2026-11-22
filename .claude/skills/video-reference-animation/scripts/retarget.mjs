export function solveTwoBone(shoulder, target, lengths, bend = 1) {
  if (![shoulder, target, lengths].every(a => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite)) || lengths.some(n => n <= 0) || ![-1, 1].includes(bend)) throw new RangeError('Invalid two-bone pose');
  const [a, b] = lengths, dx = target[0] - shoulder[0], dy = target[1] - shoulder[1];
  const requested = Math.hypot(dx, dy), d = Math.max(Math.abs(a - b) + 1e-6, Math.min(requested, a + b - 1e-6));
  const axis = requested > 1e-9 ? Math.atan2(dy, dx) : 0;
  const angle = axis + bend * Math.acos(Math.max(-1, Math.min(1, (a*a + d*d - b*b) / (2*a*d))));
  return { elbow: [shoulder[0] + a*Math.cos(angle), shoulder[1] + a*Math.sin(angle)], wrist: [shoulder[0] + d*Math.cos(axis), shoulder[1] + d*Math.sin(axis)], clamped: Math.abs(d-requested) > 1e-7 };
}
