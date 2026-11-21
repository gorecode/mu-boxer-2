import { celAt } from './moves.ts';
import { fighterGeometry } from './geometry.ts';
import { endingTiming, moves, type Fight, type Fighter, type FightEvent } from './model.ts';

type Frame = { width: number; height: number; anchorX: number; anchorY: number; scale: number };
interface Assets { arena: HTMLImageElement; boxer: HTMLImageElement[]; worker: HTMLImageElement[]; manifest: { boxer: Frame[]; worker: Frame[] } }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
const assetBase = `${import.meta.env.BASE_URL}art/fight/`;
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Не загрузился рисунок: ${url.split('/').pop()}`));
    image.src = url;
  });
}
export async function loadAssets(): Promise<Assets> {
  const response = await fetch(`${assetBase}manifest.json`);
  if (!response.ok) throw new Error('Не загрузился список рисунков.');
  const manifest = await response.json() as Assets['manifest'];
  for (const name of ['boxer', 'worker'] as const) {
    if (!Array.isArray(manifest[name]) || manifest[name].length !== 12 || manifest[name].some(f =>
      ![f.width, f.height, f.anchorX, f.anchorY, f.scale].every(Number.isFinite) || f.width <= 0 || f.height <= 0 || f.scale <= 0 || f.scale > 3)) {
      throw new Error('Повреждён список поз бойцов.');
    }
  }
  const images = await Promise.all(['arena.webp', ...Array.from({ length: 12 }, (_, i) => `boxer-${i}.webp`),
    ...Array.from({ length: 12 }, (_, i) => `worker-${i}.webp`)].map(path => loadImage(assetBase + path)));
  return { arena: images[0], boxer: images.slice(1, 13), worker: images.slice(13), manifest };
}
export class FightRenderer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private shake = 0;
  private flash = 0;
  private tags: { text: string; x: number; y: number; life: number; color: string }[] = [];
  private serial = 0;
  private visualTime = 0;
  private assets: Assets;
  private reducedMotion: boolean;
  constructor(canvas: HTMLCanvasElement, assets: Assets, reducedMotion: boolean) {
    this.assets = assets; this.reducedMotion = reducedMotion;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает рисование Canvas.');
    this.ctx = context;
  }
  clear(): void { this.particles = []; this.tags = []; this.shake = 0; this.flash = 0; this.visualTime = 0; }
  events(events: FightEvent[], s: Fight): void {
    for (const event of events) {
      const f = s[event.target];
      let y = 820 - event.y;
      const x = event.x;
      if (event.type === 'land' || event.type === 'jump') y = 817;
      else if (!event.attack) y = 820 - f.y - 350;
      const impact = event.type === 'hit' || event.type === 'break' || event.type === 'land' && f.hp === 0;
      if (impact) { this.shake = event.power >= 17 ? 10 : 5; this.flash = .07; }
      const color = event.type === 'block' ? '#c2c4e0' : event.type === 'land' || event.type === 'jump' ? '#ab8b82' : '#ffcd95';
      if (['hit', 'block', 'break', 'land', 'jump'].includes(event.type)) {
        for (let i = 0; i < (impact ? 14 : 7); i++) {
          const seed = ++this.serial;
          const angle = seed * 2.399963;
          const speed = impact ? 160 + seed % 190 : 65 + seed % 90;
          const life = .22 + (seed % 7) * .035;
          this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 65, life, max: life, color, size: impact ? 3 : 2 });
        }
      }
      if (event.type === 'hit') this.tags.push({ text: `−${event.power}`, x, y: y - 65, life: .65, color: '#ffb18a' });
      if (event.type === 'block') this.tags.push({ text: 'БЛОК', x, y: y - 50, life: .55, color: '#d3d4ed' });
      if (event.type === 'break') this.tags.push({ text: 'ЗАЩИТА ПРОБИТА', x, y: y - 50, life: .8, color: '#ffba85' });
    }
  }
  update(dt: number): void {
    this.visualTime += dt;
    this.shake = Math.max(0, this.shake - dt * 65); this.flash = Math.max(0, this.flash - dt);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 500; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const tag of this.tags) { tag.life -= dt; tag.y -= dt * 45; }
    this.tags = this.tags.filter(tag => tag.life > 0);
  }
  private pose(f: Fighter, worker: boolean): number {
    if (f.hp === 0) return 11;
    if (f.reaction === 'guard') return worker ? 5 : f.crouch ? 5 : 4;
    if (f.reaction === 'down') return 11;
    if (f.reaction || f.hurt > 0) return 6;
    if (f.action) return celAt(f.action.kind, f.action.time).cel.pose;
    if (f.dodge > 0) return 7;
    if (f.blocking) return worker ? 5 : f.crouch ? 5 : 4;
    if (f.crouch) return worker ? 7 : 5;
    if (f.y > 0) return worker ? 7 : 7;
    if (Math.abs(f.velocity) > 1) return Math.floor(f.travel / 67) % 2 ? 1 : 10;
    return 0;
  }
  private defeated(f: Fighter, worker: boolean, ending: Fight['ending']): void {
    const c = this.ctx, key = worker ? 'worker' : 'boxer';
    const progress = ending?.stage === 'fall' ? Math.min(1, ending.elapsed / endingTiming.fall) : 1;
    const x = f.x + (Math.max(350, Math.min(1250, f.x)) - f.x) * progress;
    const blend = f.y === 0 ? 1 : this.reducedMotion ? 0 : Math.max(0, Math.min(1, (70 - f.y) / 70)) * Math.max(0, Math.min(1, -f.vy / 450));
    const tilt = this.reducedMotion ? 0 : Math.min(1, progress * 1.3) * 1.05 * (worker ? 1 : -1);
    for (const [index, alpha, angle] of [[6, 1 - blend, tilt], [11, blend, 0]]) {
      if (alpha <= 0) continue;
      const frame = this.assets.manifest[key][index];
      c.save(); c.translate(x, 820 - f.y); c.scale(worker ? -f.facing : f.facing, 1);
      c.translate(0, -220); c.rotate(angle); c.translate(0, 220);
      c.scale(frame.scale, frame.scale); c.globalAlpha = alpha;
      if (f.hurt > .2) c.filter = 'brightness(1.45) sepia(.22)';
      c.drawImage(this.assets[key][index], -frame.anchorX, -frame.anchorY, frame.width, frame.height); c.restore();
    }
  }
  private fighter(f: Fighter, worker: boolean, time: number, ending: Fight['ending']): void {
    if (f.hp === 0) { this.defeated(f, worker, ending); return; }
    const c = this.ctx, key = worker ? 'worker' : 'boxer', index = this.pose(f, worker);
    const frame = this.assets.manifest[key][index], image = this.assets[key][index];
    const facing = worker ? -f.facing : f.facing;
    const idle = !f.action && !f.reaction && f.stun <= 0 && f.y === 0 && !f.crouch;
    const breath = this.reducedMotion ? 0 : idle ? Math.sin(time * 3.7 + (worker ? 2 : 0)) * 2 : 0;
    c.save();
    const ground = 820;
    c.translate(f.x, ground - f.y);
    c.scale(facing, 1);
    if (!this.reducedMotion) {
      let offset = 0, tilt = 0;
      if (f.action) {
        const m = moves[f.action.kind], t = f.action.time;
        offset = t < m.windup ? -8 * Math.sin(t / m.windup * Math.PI / 2)
          : 10 * Math.max(0, 1 - (t - m.windup) / (m.active + m.recovery));
        tilt = offset * .002;
      } else if (f.reaction) {
        tilt = f.reaction === 'heavy' ? -.13 : f.reaction === 'launch' ? -.22 : f.reaction === 'guard' ? -.035 : -.06;
        offset = -Math.min(10, f.stun * 24);
      }
      const mirror = worker ? -1 : 1;
      c.translate(offset * mirror, -220); c.rotate(tilt * mirror); c.translate(0, 220);
    }
    c.scale(frame.scale, frame.scale);
    if (f.hurt > .2) c.filter = 'brightness(1.45) sepia(.22)';
    c.drawImage(image, -frame.anchorX, -frame.anchorY + breath, frame.width, frame.height);
    c.restore();
    if (f.action && !this.reducedMotion) {
      const m = moves[f.action.kind], t = f.action.time;
      if (t >= m.windup && t < m.windup + m.active) {
        c.save(); c.globalAlpha = .28 * (1 - (t - m.windup) / m.active);
        c.strokeStyle = '#ffd1aa'; c.lineWidth = worker ? 5 : 8;
        const y = ground - f.y - (m.level === 'low' ? 115 : 405);
        c.beginPath(); c.moveTo(f.x + f.facing * 90, y - 15);
        c.quadraticCurveTo(f.x + f.facing * m.range * .8, y - 45, f.x + f.facing * m.range, y);
        c.stroke(); c.restore();
      }
    }
  }
  private guard(f: Fighter): void {
    if (!f.blocking && f.reaction !== 'guard') return;
    const c = this.ctx, height = f.crouch ? 150 : 365;
    c.save(); c.translate(f.x, 820 - f.y); c.scale(f.facing, 1);
    c.strokeStyle = '#9df1ff'; c.fillStyle = '#52b7dc24'; c.lineWidth = 5;
    c.beginPath(); c.ellipse(70, -height, 65, f.crouch ? 75 : 110, 0, -Math.PI / 2, Math.PI / 2);
    c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  private boxes(s: Fight): void {
    const c = this.ctx;
    c.save(); c.lineWidth = 2;
    for (const f of [s.worker, s.player]) {
      const geometry = fighterGeometry(f);
      for (const kind of ['hurt', 'hit'] as const) {
        c.strokeStyle = kind === 'hit' ? '#ff4264' : '#42e8ef';
        c.fillStyle = kind === 'hit' ? '#ff426433' : '#42e8ef18';
        for (const b of geometry[kind]) {
          c.fillRect(b.left, 820 - b.top, b.right - b.left, b.top - b.bottom);
          c.strokeRect(b.left, 820 - b.top, b.right - b.left, b.top - b.bottom);
        }
      }
    }
    c.font = 'bold 18px Arial'; c.textAlign = 'left';
    c.fillStyle = '#42e8ef'; c.fillText('ГОЛУБОЙ — УЯЗВИМОСТЬ', 48, 150);
    c.fillStyle = '#ff4264'; c.fillText('КРАСНЫЙ — УДАР', 48, 176);
    c.restore();
  }
  draw(s: Fight, showBoxes = false): void {
    const c = this.ctx;
    c.clearRect(0, 0, 1600, 900); c.save();
    if (!this.reducedMotion) c.translate(Math.sin(this.visualTime * 91) * this.shake, Math.cos(this.visualTime * 73) * this.shake * .4);
    c.drawImage(this.assets.arena, 0, 0, 1600, 900);
    for (const f of [s.player, s.worker]) {
      c.save(); c.translate(f.x, 823); c.scale(1, .19);
      const shadow = c.createRadialGradient(0, 0, 5, 0, 0, 145);
      shadow.addColorStop(0, '#160e22b8'); shadow.addColorStop(1, '#160e2200');
      c.fillStyle = shadow; c.globalAlpha = Math.max(.3, 1 - f.y / 300); c.beginPath(); c.arc(0, 0, 145, 0, Math.PI * 2); c.fill(); c.restore();
    }
    this.fighter(s.worker, true, s.time, s.ending); this.fighter(s.player, false, s.time, s.ending);
    if (s.phase === 'fighting') { this.guard(s.worker); this.guard(s.player); }
    const glow = c.createRadialGradient(1295, 145, 10, 1295, 145, 160);
    glow.addColorStop(0, '#ffbc6c15'); glow.addColorStop(1, '#ffbc6c00');
    c.fillStyle = glow; c.fillRect(1120, 0, 350, 330);
    c.save(); c.globalAlpha = .24;
    for (let i = 0; i < 22; i++) {
      const x = 850 + (i * 113 + s.time * (5 + i % 4)) % 600;
      const y = 190 + (i * 79 - s.time * 8) % 500;
      c.fillStyle = '#ffd1a4'; c.fillRect(x, y, 1.5, 1.5);
    }
    c.restore();
    for (const p of this.particles) {
      c.globalAlpha = p.life / p.max; c.fillStyle = p.color;
      c.fillRect(p.x, p.y, p.size * 2, p.size); c.globalAlpha = 1;
    }
    c.textAlign = 'center'; c.font = 'bold italic 24px Arial'; c.lineWidth = 4;
    for (const tag of this.tags) { c.globalAlpha = Math.min(1, tag.life * 4); c.strokeStyle = '#301c2a'; c.strokeText(tag.text, tag.x, tag.y); c.fillStyle = tag.color; c.fillText(tag.text, tag.x, tag.y); }
    c.globalAlpha = 1;
    const vignette = c.createRadialGradient(800, 430, 340, 800, 430, 1000);
    vignette.addColorStop(0, '#100d1900'); vignette.addColorStop(1, '#160f2266'); c.fillStyle = vignette; c.fillRect(0, 0, 1600, 900);
    if (this.flash > 0 && !this.reducedMotion) { c.fillStyle = `rgba(255,195,145,${this.flash * .8})`; c.fillRect(0, 0, 1600, 900); }
    if (showBoxes) this.boxes(s);
    c.restore();
  }
}

export class FightAudio {
  private context: AudioContext | undefined;
  private enabled = false;
  async toggle(): Promise<boolean> {
    if (!this.context) this.context = new AudioContext();
    await this.context.resume(); this.enabled = !this.enabled; return this.enabled;
  }
  stop(): void { void this.context?.suspend().catch(() => undefined); }
  resume(): void { if (this.enabled) void this.context?.resume().catch(() => undefined); }
  event(event: FightEvent): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const context = this.context, now = context.currentTime;
    if (['hit', 'block', 'break', 'land', 'miss', 'jump'].includes(event.type)) {
      const duration = event.type === 'hit' ? .13 : .08;
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate), data = buffer.getChannelData(0);
      let seed = 917;
      for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 1073741824 - 1) * (1 - i / data.length); }
      const noise = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      noise.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = event.type === 'block' ? 3200 : event.type === 'miss' ? 1100 : 650;
      gain.gain.setValueAtTime(event.type === 'hit' ? event.power >= 17 ? .32 : .21 : .12, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      noise.connect(filter).connect(gain).connect(context.destination); noise.start(now); noise.stop(now + duration);
    }
    if (event.type === 'hit' || event.type === 'start' || event.type === 'finish') {
      const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(event.type === 'hit' ? event.power >= 17 ? 95 : 155 : event.type === 'start' ? 260 : 180, now);
      oscillator.frequency.exponentialRampToValueAtTime(45, now + .2); gain.gain.setValueAtTime(.23, now); gain.gain.exponentialRampToValueAtTime(.001, now + .23);
      oscillator.connect(gain).connect(context.destination); oscillator.start(now); oscillator.stop(now + .24);
    }
  }
}
