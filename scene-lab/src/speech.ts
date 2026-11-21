export type Voice = 'boxer' | 'officer' | 'boxer-angry' | 'grandma';
export interface Syllable {
  at: number;
  end: number;
  pitch: [number, number, number];
  stress: number;
}
export interface SpeechPlan {
  text: string;
  voice: Voice;
  duration: number;
  letters: { at: number; end: number }[];
  syllables: Syllable[];
}

export const voices: Record<Voice, { pitch: number; roughness: number; formant: number; volume: number }> = {
  boxer: { pitch: 128, roughness: 0.08, formant: 740, volume: 0.12 },
  grandma: { pitch: 178, roughness: 0.1, formant: 940, volume: 0.11 },
  officer: { pitch: 102, roughness: 0.03, formant: 670, volume: 0.11 },
  'boxer-angry': { pitch: 142, roughness: 0.25, formant: 780, volume: 0.14 },
};

export function planSpeech(text: string, voice: Voice = 'boxer'): SpeechPlan {
  const letters: SpeechPlan['letters'] = [];
  const syllables: Syllable[] = [];
  let time = 100;
  const base = voices[voice].pitch;
  const shift = (semitones: number): number => base * 2 ** (semitones / 12);
  for (const match of text.matchAll(/\S+\s*/gu)) {
    const token = match[0];
    const word = token.trim();
    const count = (word.match(/[аеёиоуыэюяaeiouy]/giu) ?? []).length;
    const spoken = /[\p{L}\p{N}]/u.test(word);
    const units = spoken ? Math.max(1, count) : 0;
    const duration = units * 180 + (spoken ? 35 : 0);
    const characters = [...token];
    let end = match.index;
    for (let i = 0; i < characters.length; i++) {
      end += characters[i].length;
      letters.push({ at: time + duration * i / characters.length, end });
    }
    const question = /[?？]/u.test(word);
    for (let i = 0; i < units; i++) {
      const at = time + duration * i / units;
      const length = duration / units * 0.78;
      const modulation = [-0.6, 1.1, -1, 0.5][syllables.length % 4];
      const emphasis = voice === 'boxer-angry' ? 1.8 : 0;
      const rise = question ? 4 * (i + 1) / units : 0;
      syllables.push({
        at, end: at + length,
        pitch: [shift(modulation + emphasis), shift(modulation + emphasis + 1.5 + rise), shift(modulation + rise - (/[.!]/u.test(word) ? 2.5 : 0.7))],
        stress: i === 0 ? 1 : 0.82,
      });
    }
    const pause = /[?!]/u.test(word) ? 300 : /[.…]/u.test(word) ? 250 : /[,;:]/u.test(word) ? 160 : spoken ? 50 : 0;
    time += duration + pause;
  }
  return { text, voice, duration: syllables.length ? time + 100 : 0, letters, syllables };
}

export function subtitleAt(plan: SpeechPlan, elapsed: number): string {
  let end = 0;
  for (const letter of plan.letters) { if (letter.at > elapsed) break; end = letter.end; }
  return plan.text.slice(0, end);
}

export function voiceCurves(plan: SpeechPlan, offsetMs: number, rate: number): {
  duration: number; pitch: Float32Array<ArrayBuffer>; gain: Float32Array<ArrayBuffer>; mouth: Float32Array<ArrayBuffer>;
} {
  if (!Number.isFinite(offsetMs) || offsetMs < 0 || !Number.isFinite(rate) || rate <= 0) throw new Error('Неверное время речи');
  const duration = Math.max(0, plan.duration - offsetMs) / rate / 1000;
  const count = Math.max(2, Math.ceil(duration * 200) + 1);
  const pitch = new Float32Array(count);
  const gain = new Float32Array(count);
  const mouth = new Float32Array(count);
  let index = 0;
  for (let i = 0; i < count; i++) {
    const time = offsetMs + i / (count - 1) * duration * rate * 1000;
    while (index < plan.syllables.length - 1 && time >= plan.syllables[index].end) index++;
    const syllable = plan.syllables[index];
    pitch[i] = syllable?.pitch[0] ?? voices[plan.voice].pitch;
    mouth[i] = 180;
    if (!syllable || time < syllable.at || time >= syllable.end) continue;
    const fraction = (time - syllable.at) / (syllable.end - syllable.at);
    const part = fraction < 0.35 ? fraction / 0.35 : (fraction - 0.35) / 0.65;
    const from = syllable.pitch[fraction < 0.35 ? 0 : 1];
    const to = syllable.pitch[fraction < 0.35 ? 1 : 2];
    pitch[i] = from + (to - from) * part;
    gain[i] = Math.min(1, fraction / 0.14, (1 - fraction) / 0.28) * syllable.stress * voices[plan.voice].volume;
    mouth[i] = 180 + 2220 * Math.min(1, fraction / 0.23);
  }
  gain[count - 1] = 0;
  return { duration, pitch, gain, mouth };
}
