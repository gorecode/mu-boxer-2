import type { Input } from './model.ts';
export interface CommandState { forward: boolean; down: boolean; facing: number; forwardTap: number; downTap: number; forwardDouble: number; downDouble: number }
export const commandState = (): CommandState => ({ forward: false, down: false, facing: 0, forwardTap: -Infinity, downTap: -Infinity, forwardDouble: -Infinity, downDouble: -Infinity });
export function observeDirections(state: CommandState, input: Input, facing: number, now: number): void {
  if (state.facing !== facing) Object.assign(state, commandState(), { facing });
  const forward = facing === 1 ? input.right && !input.left : input.left && !input.right;
  for (const key of ['forward', 'down'] as const) {
    const held = key === 'forward' ? forward : input.down;
    const tap = key === 'forward' ? 'forwardTap' : 'downTap';
    const double = key === 'forward' ? 'forwardDouble' : 'downDouble';
    if (held && !state[key]) {
      state[double] = now - state[tap] <= .28 ? now : -Infinity;
      state[tap] = now;
    }
    state[key] = held;
  }
}
export function heavyCommand(state: CommandState, input: Input, facing: number, now: number): NonNullable<Input['attackPressed']> {
  if (input.down) {
    const upper = now - state.downDouble <= .16;
    state.downDouble = -Infinity; state.downTap = -Infinity;
    return upper ? 'upper' : 'overhand';
  }
  if (state.forward && now - state.forwardDouble <= .16) {
    state.forwardDouble = -Infinity; state.forwardTap = -Infinity;
    return 'long';
  }
  return (facing === 1 ? input.left && !input.right : input.right && !input.left) ? 'backfist' : 'heavy';
}
