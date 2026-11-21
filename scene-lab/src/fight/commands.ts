import type { Input } from './model.ts';
export interface CommandState { forward: boolean; facing: number; forwardTap: number; forwardDouble: number }
export const commandState = (): CommandState => ({ forward: false, facing: 0, forwardTap: -Infinity, forwardDouble: -Infinity });
export function observeDirections(state: CommandState, input: Input, facing: number, now: number): void {
  if (state.facing !== facing) Object.assign(state, commandState(), { facing });
  const forward = facing === 1 ? input.right && !input.left : input.left && !input.right;
  if (forward && !state.forward) {
    state.forwardDouble = now - state.forwardTap <= .28 ? now : -Infinity;
    state.forwardTap = now;
  }
  state.forward = forward;
}
export function heavyCommand(state: CommandState, input: Input, facing: number, now: number): NonNullable<Input['attackPressed']> {
  if (input.down) return 'upper';
  if (input.up) return 'overhand';
  if (state.forward && now - state.forwardDouble <= .16) {
    state.forwardDouble = -Infinity; state.forwardTap = -Infinity;
    return 'long';
  }
  return (facing === 1 ? input.left && !input.right : input.right && !input.left) ? 'backfist' : 'heavy';
}
