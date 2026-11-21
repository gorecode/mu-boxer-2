import { planSpeech, type SpeechPlan, type Voice } from './speech.ts';

export type Sound = 'ring' | 'ringback' | 'receiver' | 'paper' | 'chair' | 'impact' | 'queue-chime' | 'siren';
export interface Camera { scale: number; x: number; y: number }
interface Shot {
  at: number;
  image: string;
  imageAlt: string;
  camera: Camera;
  cameraEnd?: Camera;
}
export interface Cue {
  id: string;
  label: string;
  duration: number;
  speaker: string;
  text: string;
  voice?: Voice;
  speechDelay?: number;
  image?: string;
  imageAlt?: string;
  camera: Camera;
  shots?: Shot[];
  sounds?: { at: number; sound: Sound }[];
  fight?: boolean;
  flash?: boolean;
  blackout?: { from: number; to: number };
  titleCard?: { eyebrow: string; title: string };
  setting?: string;
}
export interface Scene {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  opponent: string;
  intro?: { location: string; title: string };
  hardCuts?: boolean;
  cues: Cue[];
}
export interface TimedCue extends Cue { start: number; end: number; speech: SpeechPlan }
export interface CompiledScene extends Omit<Scene, 'cues'> {
  cues: TimedCue[];
  duration: number;
  events: { time: number; sound: Sound }[];
}

export function compileScene(scene: Scene): CompiledScene {
  if (!scene.id || scene.cues.length === 0) throw new Error('Сцена должна содержать кадры');
  let time = 0;
  const ids = new Set<string>();
  const cues = scene.cues.map((cue) => {
    if (!cue.id || ids.has(cue.id)) throw new Error('Повторяющийся или пустой ID кадра');
    ids.add(cue.id);
    if (cue.titleCard && (!cue.titleCard.title.trim() || cue.fight)) throw new Error('Неверный титр');
    if (!Number.isFinite(cue.duration) || cue.duration <= 0) throw new Error('Неверная длительность кадра');
    if (cue.blackout && ![cue.blackout.from, cue.blackout.to].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new Error('Неверное затемнение');
    }
    validateCamera(cue.camera);
    if (cue.shots) {
      if (!cue.shots.length || cue.shots[0].at !== 0) throw new Error('Планы должны начинаться с нуля');
      for (const [index, shot] of cue.shots.entries()) {
        if (!Number.isFinite(shot.at) || shot.at < 0 || shot.at >= cue.duration ||
          (index > 0 && shot.at <= cue.shots[index - 1].at) || !shot.image.trim() || !shot.imageAlt.trim()) {
          throw new Error('Неверный план внутри кадра');
        }
        validateCamera(shot.camera);
        if (shot.cameraEnd) validateCamera(shot.cameraEnd);
      }
    }
    for (const event of cue.sounds ?? []) {
      if (!Number.isFinite(event.at) || event.at < 0 || event.at >= cue.duration) throw new Error('Звук вне кадра');
    }
    const delay = cue.speechDelay ?? 0;
    if (!Number.isFinite(delay) || delay < 0 || delay >= cue.duration) throw new Error('Неверная задержка речи');
    const speech = planSpeech(cue.text, cue.voice);
    if (speech.duration > 0 && delay > 0) {
      speech.duration += delay;
      speech.letters = speech.letters.map((letter) => ({ ...letter, at: letter.at + delay }));
      speech.syllables = speech.syllables.map((syllable) => ({ ...syllable, at: syllable.at + delay, end: syllable.end + delay }));
    }
    if (speech.duration > cue.duration) throw new Error(`Реплика не помещается в кадр: ${cue.id}`);
    const result = { ...cue, start: time, end: time + cue.duration, speech };
    time = result.end;
    return result;
  });
  return { ...scene, cues, duration: time, events: cues.flatMap((cue) =>
    (cue.sounds ?? []).map((event) => ({ time: cue.start + event.at, sound: event.sound })),
  ).sort((a, b) => a.time - b.time) };
}

function validateCamera({ scale, x, y }: Camera): void {
  if (![scale, x, y].every(Number.isFinite) || scale < 1 || scale > 5 || x < 0 || x > 100 || y < 0 || y > 100) {
    throw new Error('Неверное кадрирование');
  }
}

export function cueAt(scene: CompiledScene, time: number): TimedCue {
  return scene.cues.find((cue) => time < cue.end) ?? scene.cues[scene.cues.length - 1];
}

export function blackoutAt(scene: CompiledScene, time: number): number {
  const cue = cueAt(scene, time);
  if (!cue.blackout) return 0;
  const progress = Math.max(0, Math.min(1, (time - cue.start) / cue.duration));
  return cue.blackout.from + (cue.blackout.to - cue.blackout.from) * progress;
}

export function visualAt(scene: CompiledScene, time: number, reducedMotion = false): { image: string; imageAlt: string; camera: Camera } {
  const cue = cueAt(scene, time);
  const elapsed = Math.max(0, Math.min(cue.duration, time - cue.start));
  const shots = cue.shots;
  const index = shots?.findLastIndex((shot) => shot.at <= elapsed) ?? -1;
  const shot = shots?.[index];
  const camera = shot?.camera ?? cue.camera;
  const end = shot?.cameraEnd;
  if (!shot || !end || reducedMotion) {
    return { image: shot?.image ?? cue.image ?? scene.image, imageAlt: shot?.imageAlt ?? cue.imageAlt ?? scene.imageAlt, camera };
  }
  const duration = (shots?.[index + 1]?.at ?? cue.duration) - shot.at;
  const progress = Math.min(1, (elapsed - shot.at) / duration);
  const ease = progress * progress * (3 - 2 * progress);
  return { image: shot.image, imageAlt: shot.imageAlt, camera: {
    scale: camera.scale + (end.scale - camera.scale) * ease,
    x: camera.x + (end.x - camera.x) * ease,
    y: camera.y + (end.y - camera.y) * ease,
  } };
}

export function sceneImages(scene: CompiledScene): string[] {
  return [...new Set([scene.image, ...scene.cues.flatMap((cue) => [cue.image ?? scene.image, ...(cue.shots ?? []).map((shot) => shot.image)])])];
}

export function sceneLink(scene: CompiledScene, time: number): string {
  return `#scene=${encodeURIComponent(scene.id)}&t=${(Math.max(0, Math.min(scene.duration, time)) / 1000).toFixed(1)}`;
}

export function readSceneLink(hash: string, scenes: CompiledScene[]): { scene: CompiledScene; time: number } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const matched = scenes.find((scene) => scene.id === params.get('scene'));
  const scene = matched ?? scenes[0];
  const seconds = Number(params.get('t') ?? 0);
  return { scene, time: matched && Number.isFinite(seconds) ? Math.max(0, Math.min(scene.duration, Math.round(seconds * 1000))) : 0 };
}
