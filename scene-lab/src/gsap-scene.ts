import { gsap } from 'gsap/gsap-core';
import { createGsapCamera } from './gsap-camera.ts';
import { visualAt, type CompiledScene } from './scene.ts';

export function createSceneAnimation(scene: CompiledScene) {
  const camera = createGsapCamera(scene);
  const effects = { blackout: scene.cues[0].blackout?.from ?? 0,
    flash: scene.cues[0].flash || scene.cues[0].fight ? 0.8 : 0,
    fightScale: scene.cues[0].fight ? 0.94 : 1, fightY: scene.cues[0].fight ? 12 : 0,
    titleOpacity: scene.cues[0].titleCard ? 0 : 1, titleY: scene.cues[0].titleCard ? 12 : 0 };
  const track = gsap.timeline({ paused: true });
  for (const [index, cue] of scene.cues.entries()) {
    const start = cue.start / 1000;
    track.addLabel(cue.id, start);
    if (cue.blackout) {
      track.fromTo(effects, { blackout: cue.blackout.from }, { blackout: cue.blackout.to,
        duration: cue.duration / 1000, ease: 'none', immediateRender: false }, start);
    } else track.set(effects, { blackout: 0 }, start);
    const fightStart = cue.fight && !scene.cues[index - 1]?.fight;
    if (cue.flash || fightStart) {
      track.fromTo(effects, { flash: 0.8 }, { flash: 0, duration: Math.min(120, cue.duration) / 1000,
        ease: 'power1.out', immediateRender: false }, start);
    }
    if (fightStart) {
      track.fromTo(effects, { fightScale: 0.94, fightY: 12 }, { fightScale: 1, fightY: 0,
        duration: 0.32, ease: 'power3.out', immediateRender: false }, start);
    }
    if (cue.titleCard) {
      track.fromTo(effects, { titleOpacity: 0, titleY: 12 }, { titleOpacity: 1, titleY: 0,
        duration: Math.min(450, cue.duration) / 1000, ease: 'power2.out', immediateRender: false }, start);
    }
  }
  let disposed = false;
  return {
    at(time: number, reducedMotion = false) {
      if (disposed) throw new Error('Scene animation disposed');
      if (!Number.isFinite(time)) throw new Error('Invalid animation time');
      const position = Math.max(0, Math.min(scene.duration, time));
      track.time(position / 1000, true);
      return { camera: reducedMotion ? { ...visualAt(scene, position, true).camera } : camera.at(position),
        blackout: effects.blackout, flash: reducedMotion ? 0 : effects.flash,
        fightScale: reducedMotion ? 1 : effects.fightScale, fightY: reducedMotion ? 0 : effects.fightY,
        titleOpacity: reducedMotion ? 1 : effects.titleOpacity, titleY: reducedMotion ? 0 : effects.titleY };
    },
    dispose(): void { camera.dispose(); track.kill(); disposed = true; },
  };
}
