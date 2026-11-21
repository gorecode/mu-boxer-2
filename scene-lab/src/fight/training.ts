import { copyTraining, idleInput, moves, type Attack, type Fight } from './model.ts';
import { celAt, editCel, resetCels, type Box } from './moves.ts';
import { fighterGeometry } from './geometry.ts';

interface Host { fight(): Fight; replace(s: Fight): void; reset(): void; clear(): void; draw(): void; step(): void }
export function mountTraining(canvas: HTMLCanvasElement, host: Host) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const mode = get<HTMLInputElement>('training-mode'), panel = get<HTMLDetailsElement>('training-panel');
  const dummy = get<HTMLSelectElement>('training-dummy'), speed = get<HTMLSelectElement>('training-speed');
  const freeze = get<HTMLButtonElement>('training-freeze'), step = get<HTMLButtonElement>('training-step');
  const status = get<HTMLOutputElement>('training-status'), stats = get<HTMLOutputElement>('training-stats');
  const attack = get<HTMLSelectElement>('edit-attack'), phase = get<HTMLSelectElement>('edit-phase');
  const duration = get<HTMLInputElement>('edit-duration'), pose = get<HTMLInputElement>('edit-pose');
  const edges = ['left', 'bottom', 'right', 'top'] as const;
  const inputs = edges.map(edge => get<HTMLInputElement>(`edit-${edge}`));
  let frozen = false, saved: Fight | null = null;
  let drag: { id: number; x: number; y: number; box: Box } | null = null;
  const kind = () => attack.value as Attack;
  const index = () => Number(phase.value);
  const actor = () => ['poke', 'sweep', 'overhead'].includes(kind()) ? host.fight().worker : host.fight().player;
  const active = () => mode.checked && host.fight().phase === 'fighting';
  function fields(): void {
    const cel = moves[kind()].cels[index()];
    duration.value = String(Math.round(cel.duration * 1000)); pose.value = String(cel.pose);
    inputs.forEach((input, i) => { input.disabled = !cel.hit.length; input.value = String(cel.hit[0]?.[edges[i]] ?? 0); });
  }
  function refresh(): void {
    freeze.textContent = frozen ? 'ПУСТИТЬ' : 'ЗАМОРОЗИТЬ'; freeze.setAttribute('aria-pressed', String(frozen));
    freeze.disabled = !active(); step.disabled = !active() || !frozen;
    get<HTMLButtonElement>('training-save').disabled = !active();
    get<HTMLButtonElement>('training-load').disabled = !active() || !saved;
    for (const id of ['training-health', 'edit-preview']) get<HTMLButtonElement>(id).disabled = !active();
    const s = host.fight();
    const remaining = (f: Fight['player']) => Math.round(1000 * (f.stop + Math.max(f.stun, f.action ? moves[f.action.kind].windup + moves[f.action.kind].active + moves[f.action.kind].recovery - f.action.time : 0)));
    const names = { windup: 'замах', active: 'контакт', settle: 'выдержка', recovery: 'возврат' };
    const name = (f: Fight['player']) => f.action ? names[celAt(f.action.kind, f.action.time).cel.phase] : 'стойка';
    stats.textContent = `Боксёр: ${name(s.player)} / Рабочий: ${name(s.worker)} · остаток приёма/оглушения ${remaining(s.player)} мс / ${remaining(s.worker)} мс · ${s.training.gap ? 'ЕСТЬ РАЗРЫВ — МАНЕКЕН ЗАБЛОКИРОВАЛ' : `серия ${s.combo}`} · AI: ${s.brain.intent}`;
  }
  function stop(): void {
    frozen = true; host.clear(); host.fight().held = idleInput(); host.fight().buffered = null;
  }
  function preview(): void {
    if (!active()) return;
    stop();
    const s = host.fight(), m = moves[kind()], time = m.cels.slice(0, index()).reduce((n, c) => n + c.duration, 0);
    for (const [i, f] of [s.player, s.worker].entries()) {
      Object.assign(f, { x: i ? 900 : 600, y: 0, vy: 0, facing: i ? -1 : 1, action: null, reaction: null, stun: 0, stop: 0, hurt: 0, invulnerable: 0, knockback: 0, velocity: 0, dodge: 0, blocking: false, crouch: false });
    }
    actor().action = { kind: kind(), time: time + Math.min(1/120, m.cels[index()].duration / 2), connected: false };
    dummy.value = 'idle'; s.training.dummy = 'idle'; s.training.firstHit = false; s.training.gap = false;
    s.combo = 0; s.comboActive = false; s.hitstop = 0; s.events = [];
    get<HTMLInputElement>('hitboxes').checked = true;
    host.draw(); refresh();
  }
  mode.addEventListener('change', () => { panel.hidden = !mode.checked; panel.open = mode.checked; frozen = false; drag = null; host.reset(); refresh(); });
  dummy.addEventListener('change', () => {
    const s = host.fight(); s.training.dummy = dummy.value as Fight['training']['dummy']; s.training.firstHit = false; s.training.gap = false;
    Object.assign(s.worker, { action: null, reaction: null, stun: 0, stop: 0, blocking: false, crouch: false });
    host.draw(); refresh();
  });
  freeze.addEventListener('click', () => { if (!active()) return; if (frozen) frozen = false; else stop(); host.draw(); refresh(); });
  step.addEventListener('click', () => { if (active() && frozen) { host.step(); host.draw(); refresh(); } });
  get('training-health').addEventListener('click', () => {
    if (!active()) return;
    for (const f of [host.fight().player, host.fight().worker]) { f.hp = f.maxHp; f.guard = 100; f.guardDelay = 0; }
    host.fight().training.firstHit = false; host.fight().training.gap = false; host.fight().combo = 0; host.fight().comboActive = false;
    host.draw(); refresh();
  });
  get('training-save').addEventListener('click', () => { if (active()) { saved = copyTraining(host.fight()); status.textContent = 'Момент сохранён.'; refresh(); } });
  get('training-load').addEventListener('click', () => { if (active() && saved) { stop(); const restored = copyTraining(saved); dummy.value = restored.training.dummy; host.replace(restored); status.textContent = 'Момент восстановлен. Выполните шаг или пустите бой.'; refresh(); } });
  for (const select of [attack, phase]) select.addEventListener('change', () => { fields(); preview(); });
  get('edit-preview').addEventListener('click', preview);
  for (const input of [duration, pose, ...inputs]) input.addEventListener('change', () => {
    try {
      if (!input.value.trim()) throw new RangeError('Введите число.');
      const patch = input === duration ? { duration: Number(input.value) / 1000 } : input === pose ? { pose: Number(input.value) }
        : { hit: [Object.fromEntries(inputs.map((v, i) => [edges[i], Number(v.value)])) as unknown as Box] };
      editCel(kind(), index(), patch); status.textContent = 'Фаза обновлена. Изменения действуют и в бою.'; preview();
    } catch (error) { status.textContent = (error as Error).message; }
    fields();
  });
  get('edit-defaults').addEventListener('click', () => { resetCels(); fields(); preview(); status.textContent = 'Исходные фазы восстановлены.'; });
  get('edit-export').addEventListener('click', () => {
    const data = Object.fromEntries(Object.entries(moves).map(([kind, move]) => [kind, move.cels]));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, moves: data }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'mu-boxer-moves.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect(), width = Math.min(r.width, r.height * 16/9), height = width * 9/16;
    return { x: (e.clientX - r.left - (r.width - width)/2) * 1600 / width, y: 820 - (e.clientY - r.top - (r.height - height)/2) * 900 / height };
  };
  canvas.addEventListener('pointerdown', e => {
    if (!active() || !frozen || !get<HTMLInputElement>('hitboxes').checked || index() !== 1 || actor().action?.kind !== kind() || celAt(kind(), actor().action!.time).index !== 1) return;
    const p = point(e), b = fighterGeometry(actor()).hit[0];
    if (!b || p.x < b.left || p.x > b.right || p.y < b.bottom || p.y > b.top) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId); drag = { id: e.pointerId, ...p, box: { ...moves[kind()].cels[1].hit[0] } };
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId || !active() || !frozen) return;
    const p = point(e), dx = (p.x - drag.x) * actor().facing, dy = p.y - drag.y, b = drag.box;
    try { editCel(kind(), 1, { hit: [{ left: Math.round(b.left + dx), right: Math.round(b.right + dx), bottom: Math.round(b.bottom + dy), top: Math.round(b.top + dy) }] }); fields(); host.draw(); }
    catch { status.textContent = 'Зона должна оставаться в пределах редактора.'; }
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { drag = null; });
  fields();
  return { frozen: () => mode.checked && frozen, speed: () => mode.checked ? Number(speed.value) : 1, refresh,
    reset: () => { frozen = false; drag = null; refresh(); } };
}
