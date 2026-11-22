export const speed = 355;
export const stride = 134;
export const distance = stride * 2;
export const motionMs = distance / speed * 1000;
export const retreatMs = 1500;
export const durationMs = 2700;
export const variants = {
  two: [[0, 0], [.5, 2]],
  three: [[0, 0], [.5, 2], [.75, 3]],
  four: [[0, 0], [.25, 1], [.5, 2], [.75, 3]],
};

export function frameAt(variant, displacement) {
  if (!Object.hasOwn(variants, variant)) throw new RangeError('Unknown walk variant');
  if (!Number.isFinite(displacement) || displacement < 0) throw new RangeError('Expected nonnegative finite displacement');
  const phase = ((displacement % stride) + 1e-9) / stride;
  return variants[variant].findLast(([start]) => phase >= start)[1];
}

export function motionAt(ms) {
  if (!Number.isFinite(ms) || ms < 0 || ms > durationMs) throw new RangeError('Preview time outside route');
  const forward = ms >= 300 && ms < 300 + motionMs;
  const backward = ms >= retreatMs && ms < retreatMs + motionMs;
  const x = ms < 300 ? 0 : ms < 300 + motionMs ? (ms - 300) / 1000 * speed
    : ms < retreatMs ? distance : ms < retreatMs + motionMs ? distance - (ms - retreatMs) / 1000 * speed : 0;
  return { x, moving: forward || backward, direction: backward ? -1 : 1 };
}
