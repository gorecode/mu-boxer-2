import { gsap } from 'gsap/gsap-core';

export const initial = { city: 0, rail: 0, paper: 150, angle: -12, stamp: 1.8, ink: 0, black: 0 };
export type LayerState = typeof initial;
export const duration = (lead: number): number => lead + 5200;

function checkLead(lead: number): void {
  if (!Number.isFinite(lead) || lead < 0 || lead > 2000) throw new Error('Invalid lead-in');
}

function position(time: number, lead: number): number {
  if (!Number.isFinite(time)) throw new Error('Invalid layer time');
  return Math.max(0, Math.min(duration(lead), time));
}

export function nativeLayers(time: number, lead = 800): LayerState {
  checkLead(lead);
  const elapsed = (position(time, lead) - lead) / 1000;
  const progress = (start: number, length: number) => Math.max(0, Math.min(1, (elapsed - start) / length));
  const enter = 1 - (1 - progress(0, 1.2)) ** 3;
  const impact = progress(1.5, 0.35) - 1;
  const settle = 1 + 2.4 * impact ** 3 + 1.4 * impact ** 2;
  return {
    city: -4 * progress(0, 4),
    rail: 12 * progress(0, 3.2),
    paper: initial.paper * (1 - enter),
    angle: initial.angle * (1 - enter),
    stamp: 1.8 - 0.8 * settle,
    ink: elapsed >= 1.5 ? 1 : 0,
    black: progress(4, 0.5),
  };
}

export function createLayerTimeline(lead = 800) {
  checkLead(lead);
  const state = { ...initial };
  const track = gsap.timeline({ paused: true });
  track.addLabel('paper', lead / 1000)
    .to(state, { city: -4, duration: 4, ease: 'none' }, 'paper')
    .to(state, { rail: 12, duration: 3.2, ease: 'none' }, 'paper')
    .to(state, { paper: 0, angle: 0, duration: 1.2, ease: 'power2.out' }, 'paper')
    .addLabel('stamp', 'paper+=1.5')
    .set(state, { ink: 1 }, 'stamp')
    .to(state, { stamp: 1, duration: 0.35, ease: 'back.out(1.4)' }, 'stamp')
    .addLabel('fade', 'stamp+=2.5')
    .to(state, { black: 1, duration: 0.5, ease: 'none' }, 'fade');
  let disposed = false;
  return {
    at(time: number): LayerState {
      if (disposed) throw new Error('Layer timeline disposed');
      track.time(position(time, lead) / 1000, true);
      const { city, rail, paper, angle, stamp, ink, black } = state;
      return { city, rail, paper, angle, stamp, ink, black };
    },
    dispose(): void { track.kill(); disposed = true; },
  };
}

export function reducedLayers(time: number, lead = 800): LayerState {
  checkLead(lead);
  const elapsed = (position(time, lead) - lead) / 1000;
  return { ...initial, paper: elapsed >= 0 ? 0 : initial.paper, angle: 0, stamp: 1,
    ink: elapsed >= 1.5 ? 1 : 0, black: elapsed >= 4 ? 1 : 0 };
}
