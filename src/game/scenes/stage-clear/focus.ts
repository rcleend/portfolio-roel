/**
 * Cursor model for the stage-clear screen: a vertical list of highlight rows
 * above a row of option buttons. Pure, so navigation rules are testable
 * without a canvas.
 */
export type ClearFocus =
  | { readonly area: 'rows'; readonly index: number }
  | { readonly area: 'buttons'; readonly index: number };

export interface FocusShape {
  readonly rows: number;
  readonly buttons: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Starts on the first collected highlight, so the first confirm opens the
 * career story; without any, on the primary option.
 */
export function initialClearFocus(collected: readonly boolean[]): ClearFocus {
  const first = collected.indexOf(true);
  return first >= 0 ? { area: 'rows', index: first } : { area: 'buttons', index: 0 };
}

export function moveFocus(focus: ClearFocus, direction: Direction, shape: FocusShape): ClearFocus {
  if (focus.area === 'rows') {
    if (direction === 'up') return { area: 'rows', index: Math.max(0, focus.index - 1) };
    if (direction === 'down') {
      if (focus.index < shape.rows - 1) return { area: 'rows', index: focus.index + 1 };
      return shape.buttons > 0 ? { area: 'buttons', index: 0 } : focus;
    }
    return focus;
  }
  if (direction === 'up') return shape.rows > 0 ? { area: 'rows', index: shape.rows - 1 } : focus;
  if (direction === 'left') return { area: 'buttons', index: Math.max(0, focus.index - 1) };
  if (direction === 'right') return { area: 'buttons', index: Math.min(shape.buttons - 1, focus.index + 1) };
  return focus;
}
