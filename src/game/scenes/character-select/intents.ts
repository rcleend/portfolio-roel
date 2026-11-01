import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import type { Action } from '../../input/bindings';
import type { HitTarget } from './layout';
import type { SelectEvent } from './selectMachine';

/**
 * Reads one step of input as select-screen events, in the order the state
 * machine should apply them: switching first, so a confirm in the same step
 * commits to the character the player just landed on.
 */
export function readSelectEvents(
  input: InputSnapshot<Action>,
  hitTest: (x: number, y: number) => HitTarget | null,
): SelectEvent[] {
  const events: SelectEvent[] = [];
  const { pointer } = input;
  const hit = pointer.over ? hitTest(pointer.x, pointer.y) : null;

  if (input.wasPressed('left') || (pointer.pressed && hit === 'arrowLeft')) events.push({ type: 'switch', delta: -1 });
  if (input.wasPressed('right') || (pointer.pressed && hit === 'arrowRight')) events.push({ type: 'switch', delta: 1 });
  // A mouse click on the card picks the hero on show, as Enter does; a finger there does what it always did.
  const cardClick = pointer.pressed && pointer.kind === 'mouse' && hit === 'card';
  if (input.wasPressed('confirm') || cardClick) events.push({ type: 'confirm' });
  if (input.wasPressed('back')) events.push({ type: 'back' });
  return events;
}
