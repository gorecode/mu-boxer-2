import { voiceCurves, voices, type SpeechPlan } from './speech.ts';

// Harmonic source and fixed formants adapted from mu-screamo/src/audio/voice.ts.
export function playMooSpeech(context: BaseAudioContext, destination: AudioNode, plan: SpeechPlan, offsetMs = 0, rate = 1): () => void {
  const curves = voiceCurves(plan, offsetMs, rate);
  if (curves.duration === 0 || plan.syllables.length === 0) return () => {};
  const at = context.currentTime;
  const profile = voices[plan.voice];
  const nodes: AudioNode[] = [];
  const own = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
  const source = own(context.createOscillator());
  const real = new Float32Array(65);
  for (let k = 1; k < real.length; k++) real[k] = 1 / k ** 1.15;
  source.setPeriodicWave(context.createPeriodicWave(real, new Float32Array(65)));
  source.frequency.setValueCurveAtTime(curves.pitch, at, curves.duration);
  const mix = own(context.createGain());
  source.connect(mix);
  const sub = own(context.createOscillator());
  sub.type = 'triangle';
  sub.frequency.setValueCurveAtTime(curves.pitch.map((value) => value / 2), at, curves.duration);
  const split = own(context.createGain());
  split.gain.value = profile.roughness * 0.5;
  sub.connect(split).connect(mix);
  const breath = own(context.createBufferSource());
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.2), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 42;
  for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
  breath.buffer = buffer;
  breath.loop = true;
  const breathGain = own(context.createGain());
  breathGain.gain.value = 0.025;
  breath.connect(breathGain).connect(mix);
  const rasp = own(context.createWaveShaper());
  const drive = 1 + profile.roughness * 4;
  rasp.curve = Float32Array.from({ length: 2049 }, (_, i) => Math.tanh(drive * (i / 1024 - 1)) / Math.tanh(drive));
  rasp.oversample = '2x';
  mix.connect(rasp);
  let output: AudioNode = rasp;
  const tract: [BiquadFilterType, number, number, number][] = [
    ['lowpass', 2400, 0.7, 0], ['peaking', 400, 2.2, 5],
    ['peaking', profile.formant, 5.5, 14], ['notch', 1400, 2, 0], ['peaking', 2200, 3, 4],
  ];
  for (const [type, frequency, q, gain] of tract) {
    const filter = own(context.createBiquadFilter());
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = q; filter.gain.value = gain;
    if (type === 'lowpass') filter.frequency.setValueCurveAtTime(curves.mouth, at, curves.duration);
    output.connect(filter); output = filter;
  }
  const amp = own(context.createGain());
  amp.gain.setValueCurveAtTime(curves.gain, at, curves.duration);
  const gate = own(context.createGain());
  gate.gain.setValueAtTime(0, at);
  gate.gain.linearRampToValueAtTime(1, at + Math.min(0.006, curves.duration / 2));
  output.connect(amp).connect(gate).connect(destination);
  const sources = [source, sub, breath];
  let stopped = false;
  const disconnect = (): void => { for (const node of nodes) node.disconnect(); };
  source.onended = disconnect;
  for (const node of sources) { node.start(at); node.stop(at + curves.duration); }
  return () => {
    if (stopped) return;
    stopped = true;
    gate.gain.cancelScheduledValues(context.currentTime);
    gate.gain.setValueAtTime(0, context.currentTime);
    for (const node of sources) { try { node.stop(); } catch { /* Already ended. */ } }
    disconnect();
  };
}
