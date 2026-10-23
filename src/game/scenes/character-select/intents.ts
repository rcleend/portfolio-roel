import type { InputSnapshot, PointerSnapshot } from '@/engine/input/InputSnapshot';
import type { Action } from '../../input/bindings';
import type { HitTarget } from './layout';
import type { SelectEvent } from './selectMachine';

/**
 * Reads one step of input as select-screen events, in the order the state
 * machine should apply them: switching first, so a confirm in the same step
 * commits to the character the player just landed on.
 *
 * `previous` is last step's pointer; focus follows the pointer only when it
 * actually moves, so a mouse resting on a skill cannot fight the arrow keys.
 */
export function readSelectEvents(
  input: InputSnapshot<Action>,
  previous: PointerSnapshot,
  hitTest: (x: number, y: number) => HitTarget | null,
): SelectEvent[] {
  const events: SelectEvent[] = [];
  const { pointer } = input;
  const hit = pointer.over ? hitTest(pointer.x, pointer.y) : null;

  if (input.wasPressed('left') || (pointer.pressed && hit === 'arrowLeft')) events.push({ type: 'switch', delta: -1 });
  if (input.wasPressed('right') || (pointer.pressed && hit === 'arrowRight')) events.push({ type: 'switch', delta: 1 });
  if (input.wasPressed('up')) events.push({ type: 'move', delta: -1 });
  if (input.wasPressed('down')) events.push({ type: 'move', delta: 1 });

  const moved = pointer.over && (!previous.over || previous.x !== pointer.x || previous.y !== pointer.y);
  if ((moved || pointer.pressed) && hit !== null && hit !== 'arrowLeft' && hit !== 'arrowRight') {
    events.push({ type: 'point', target: hit, pressed: pointer.pressed });
  }

  if (input.wasPressed('confirm')) events.push({ type: 'confirm' });
  if (input.wasPressed('back')) events.push({ type: 'back' });
  return events;
}
