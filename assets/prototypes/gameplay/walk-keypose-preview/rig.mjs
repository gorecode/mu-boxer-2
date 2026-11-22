import { stride } from './schedule.mjs';

export const stage = { width: 500, height: 530, anchorX: 228, anchorY: 495, scale: 1.19 };
export const poses = [
  { spread: 0, drop: 0, frontLift: 0, rearLift: 0 },
  { spread: stride / 4 / stage.scale, drop: 4, frontLift: 6, rearLift: 0 },
  { spread: stride / 2 / stage.scale, drop: 8, frontLift: 0, rearLift: 0 },
  { spread: stride / 4 / stage.scale, drop: 4, frontLift: 0, rearLift: 5 },
];
const clamp = value => Math.max(0, Math.min(1, value));
function weights(x, y) {
  const t = clamp((x - 100) / 70), ground = clamp((y - 230) / 215);
  return { front: t * t * (3 - 2 * t), ground, slope: t > 0 && t < 1 ? 6 * t * (1 - t) / 70 : 0 };
}
export function transformPoint(x, y, pose) {
  const { front, ground } = weights(x, y);
  return [x + pose.spread * (2 * front - 1) * ground,
    y + pose.drop * (1 - ground) - (pose.frontLift * front + pose.rearLift * (1 - front)) * ground];
}
export function inversePoint(x, y, pose) {
  let sx = x, sy = y - pose.drop;
  for (let i = 0; i < 8; i++) {
    const { front, ground, slope } = weights(sx, sy);
    const lift = pose.frontLift * front + pose.rearLift * (1 - front);
    sx -= (sx + pose.spread * (2 * front - 1) * ground - x) / (1 + pose.spread * 2 * slope * ground);
    const dy = sy > 230 && sy < 445 ? 1 - (pose.drop + lift) / 215 : 1;
    sy -= (sy + pose.drop * (1 - ground) - lift * ground - y) / dy;
  }
  return [sx, sy];
}

export function bakeFrames(source) {
  const native = document.createElement('canvas'); native.width = source.width; native.height = source.height;
  const context = native.getContext('2d'); context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, native.width, native.height).data;
  return poses.map((pose, i) => {
    const canvas = document.createElement('canvas'); canvas.width = stage.width; canvas.height = stage.height;
    const ctx = canvas.getContext('2d');
    if (i === 0) { ctx.drawImage(source, 64, 0); return canvas; }
    const image = ctx.createImageData(stage.width, stage.height), out = image.data;
    for (let y = 0; y < stage.height; y++) for (let x = 0; x < stage.width; x++) {
      const [sx, sy] = inversePoint(x - 64, y, pose);
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
      const rgba = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const px = ix + dx, py = iy + dy;
        if (px < 0 || px >= native.width || py < 0 || py >= native.height) continue;
        const index = (py * native.width + px) * 4;
        const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy), alpha = pixels[index + 3] / 255;
        for (let c = 0; c < 3; c++) rgba[c] += pixels[index + c] * alpha * weight;
        rgba[3] += alpha * weight;
      }
      const target = (y * stage.width + x) * 4;
      if (rgba[3] > 0) for (let c = 0; c < 3; c++) out[target + c] = Math.round(rgba[c] / rgba[3]);
      out[target + 3] = Math.round(rgba[3] * 255);
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  });
}
