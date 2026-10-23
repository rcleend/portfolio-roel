import { describe, expect, it } from 'vitest';
import { type ClearFocus, initialClearFocus, moveFocus } from './focus';

const shape = { rows: 3, buttons: 2 };
const row = (index: number): ClearFocus => ({ area: 'rows', index });
const button = (index: number): ClearFocus => ({ area: 'buttons', index });

describe('initialClearFocus', () => {
  it('starts on the first collected highlight', () => {
    expect(initialClearFocus([false, true, true])).toEqual(row(1));
  });

  it('falls back to the primary option when nothing was collected', () => {
    expect(initialClearFocus([false, false])).toEqual(button(0));
    expect(initialClearFocus([])).toEqual(button(0));
  });
});

describe('moveFocus', () => {
  it('walks the highlight list and stops at the top', () => {
    expect(moveFocus(row(0), 'down', shape)).toEqual(row(1));
    expect(moveFocus(row(0), 'up', shape)).toEqual(row(0));
  });

  it('drops from the last row onto the primary button and climbs back to the last row', () => {
    expect(moveFocus(row(2), 'down', shape)).toEqual(button(0));
    expect(moveFocus(button(1), 'up', shape)).toEqual(row(2));
  });

  it('moves sideways between buttons without wrapping', () => {
    expect(moveFocus(button(0), 'right', shape)).toEqual(button(1));
    expect(moveFocus(button(1), 'right', shape)).toEqual(button(1));
    expect(moveFocus(button(0), 'left', shape)).toEqual(button(0));
  });

  it('ignores sideways input on rows and downward input on buttons', () => {
    expect(moveFocus(row(1), 'left', shape)).toEqual(row(1));
    expect(moveFocus(button(0), 'down', shape)).toEqual(button(0));
  });

  it('copes with a screen that has no rows', () => {
    expect(moveFocus(button(0), 'up', { rows: 0, buttons: 2 })).toEqual(button(0));
  });
});
