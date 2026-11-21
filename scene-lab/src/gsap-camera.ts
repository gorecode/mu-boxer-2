import { gsap } from 'gsap/gsap-core';
import type { Camera, CompiledScene } from './scene.ts';

export function createGsapCamera(scene: CompiledScene) {
  const camera = { ...(scene.cues[0].shots?.[0].camera ?? scene.cues[0].camera) };
  const track = gsap.timeline({ paused: true });
  for (const cue of scene.cues) {
    if (!cue.shots?.length) track.set(camera, { ...cue.camera }, cue.start / 1000);
    for (const [index, shot] of (cue.shots ?? []).entries()) {
      const start = (cue.start + shot.at) / 1000;
      track.set(camera, { ...shot.camera }, start);
      if (shot.cameraEnd) {
        track.fromTo(camera, { ...shot.camera }, {
          ...shot.cameraEnd,
          duration: ((cue.shots?.[index + 1]?.at ?? cue.duration) - shot.at) / 1000,
          ease: (progress: number) => progress * progress * (3 - 2 * progress),
          immediateRender: false,
        }, start);
      }
    }
  }
  let disposed = false;
  return {
    at(time: number): Camera {
      if (disposed) throw new Error('Camera track disposed');
      if (!Number.isFinite(time)) throw new Error('Invalid camera time');
      track.time(Math.max(0, Math.min(scene.duration, time)) / 1000, true);
      return { scale: camera.scale, x: camera.x, y: camera.y };
    },
    dispose(): void {
      track.kill();
      disposed = true;
    },
  };
}
