import { frameAt, motionAt, durationMs } from './schedule.mjs';
import { bakeFrames, stage, poses } from './rig.mjs';

const load = async url => { const image = new Image(); image.src = url; await image.decode(); return image; };
const [arena, master] = await Promise.all([
  load('../../../../scene-lab/public/art/fight/arena.webp'),
  load('../../../../scene-lab/public/art/fight/boxer-0.webp'),
]);
const frames = bakeFrames(master);
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const columns = [['two', '2 РИСУНКА'], ['three', '3 РИСУНКА'], ['four', '4 РИСУНКА']];
window.walkPreview = {
  render(ms) {
    const state = motionAt(ms), selected = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let j = 0; j < 3; j++) {
      const [variant, label] = columns[j];
      const pose = state.moving ? frameAt(variant, state.x) : 0;
      selected.push(pose);
      ctx.save(); ctx.translate(j * 500, 0);
      ctx.beginPath(); ctx.rect(0, 56, 500, 504); ctx.clip();
      ctx.drawImage(arena, -190 * .65, 530 - 820 * .65, 1600 * .65, 900 * .65);
      const x = (430 - 190 + state.x) * .65;
      ctx.save(); ctx.translate(x, 533); ctx.scale(1, .15);
      const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, 100);
      shade.addColorStop(0, '#150c22aa'); shade.addColorStop(1, '#150c2200');
      ctx.fillStyle = shade; ctx.fillRect(-100, -100, 200, 200); ctx.restore();
      ctx.save(); ctx.translate(x, 530); ctx.scale(1.19 * .65, 1.19 * .65);
      ctx.drawImage(frames[pose], -228, -495); ctx.restore();
      ctx.restore();
      ctx.fillStyle = '#241f29'; ctx.fillRect(j * 500, 0, 500, 56); ctx.fillRect(j * 500, 560, 500, 40);
      ctx.fillStyle = '#f8d8c4'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center';
      ctx.fillText(label, j * 500 + 250, 35);
      ctx.fillStyle = '#c9b5b7'; ctx.font = '17px Arial';
      const motion = state.moving ? state.direction === 1 ? 'ВПЕРЁД' : 'НАЗАД' : 'СТОЙКА';
      ctx.fillText(`${motion} · ПОЗА ${pose} · ${Math.round(state.x)} px`, j * 500 + 250, 585);
      ctx.fillStyle = '#241f29'; ctx.fillRect(j * 500, 0, 2, 600);
    }
    return { ...state, selected, png: canvas.toDataURL('image/png').split(',')[1] };
  }, durationMs, stage, poses, baked: frames.map(frame => frame.toDataURL('image/png').split(',')[1]),
};
window.walkPreview.render(0);
window.ready = true;
