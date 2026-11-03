import type { GameCursor } from '@/engine/core/GameSurface';
import type { PointerKind } from '@/engine/input/InputSnapshot';

/**
 * Names and draws the game's cursor on the element presenting its picture (the flat host's screen), as the room's
 * stage does its own (docs/ROOM.md › Cursors): `data-cursor` for tests, and the page's custom property for the look,
 * the hand being the stage's `play` and the arrow its `play-arrow`.
 */
export function showGameCursor(element: HTMLElement, cursor: GameCursor): void {
  const name = cursor === 'hand' ? 'play' : cursor === 'arrow' ? 'play-arrow' : cursor;
  if (element.dataset.cursor === name) return;
  element.dataset.cursor = name;
  // Where the page draws none of its own: the arrow, a pointer, and for an attack a crosshair.
  const stock = cursor === 'arrow' ? 'default' : cursor === 'attack' ? 'crosshair' : 'pointer';
  element.style.cursor = `var(--room-cursor-${name}, ${stock})`;
}

/** The game's name for a DOM pointer's device. */
export function pointerKind(pointerType: string): PointerKind {
  return pointerType === 'touch' || pointerType === 'pen' ? pointerType : 'mouse';
}
