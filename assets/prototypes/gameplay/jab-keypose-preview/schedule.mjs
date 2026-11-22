export const duration = 340;
export const schedules = {
  legacy: [[0, 'boxer', 0], [80, 'boxer', 2], [160, 'boxer', 0]],
  smooth: [
    [0, 'jab', 0], [20, 'jab', 1], [40, 'jab', 2], [60, 'jab', 3], [80, 'jab', 4],
    ...Array.from({length: 9}, (_, i) => [160 + i * 20, 'jab', i + 8]),
  ],
  hybrid: [[0, 'boxer', 0], [40, 'jab', 2], [80, 'boxer', 2], [160, 'jab', 12], [220, 'boxer', 0]],
};

export function poseAt(schedule, time) {
  if (!Number.isFinite(time)) throw new RangeError('Expected a finite animation time');
  if (time < 0 || time >= 340) return [0, 'boxer', 0];
  return schedule.findLast(([start]) => time >= start);
}
