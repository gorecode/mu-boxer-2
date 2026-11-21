import { action, makeObservable, observable } from 'mobx';
import type { CompiledScene } from './scene.ts';
import { Timeline } from './timeline.ts';

export function observableTimeline(scene: CompiledScene): Timeline {
  return makeObservable(new Timeline(scene), {
    time: observable, playing: observable, rate: observable,
    play: action, pause: action, seek: action, setRate: action, advance: action,
  });
}
