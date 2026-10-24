import { describe, expect, it } from 'vitest';
import { LineupParamsError, resolveLineup } from './params';

describe('resolveLineup', () => {
  it('stands the Terraria designs on the select screen unless asked otherwise', () => {
    expect(resolveLineup(undefined)).toEqual({ cast: 'terraria', backdrop: 'menu' });
    expect(resolveLineup({ cast: 'game', backdrop: 'luna' })).toEqual({ cast: 'game', backdrop: 'luna' });
    expect(resolveLineup({ cast: 'revised' })).toEqual({ cast: 'revised', backdrop: 'menu' });
  });

  it.each([
    [{ cast: 'arcade' }, 'lineup: cast must be one of terraria, revised, game, got "arcade"'],
    [{ backdrop: 'mars' }, 'lineup: backdrop must be one of menu, luna, scripe, got "mars"'],
  ])('rejects %j, naming what it accepts', (params, message) => {
    // The harness passes untrusted JSON, so the types are bypassed on purpose here.
    expect(() => resolveLineup(params as never)).toThrow(new LineupParamsError(message));
  });
});
