import { describe, expect, it } from 'vitest';
import { LineupParamsError, resolveLineup } from './params';

describe('resolveLineup', () => {
  it('stands the Terraria designs on the select screen unless asked otherwise', () => {
    expect(resolveLineup(undefined)).toEqual({ cast: 'terraria', backdrop: 'menu' });
    expect(resolveLineup({ cast: 'game', backdrop: 'luna' })).toEqual({ cast: 'game', backdrop: 'luna' });
    expect(resolveLineup({ cast: 'revised' })).toEqual({ cast: 'revised', backdrop: 'menu' });
  });

  it("stands the game's customer in the customers cast unless a concept is asked for", () => {
    expect(resolveLineup({ cast: 'customers' })).toEqual({ cast: 'customers', backdrop: 'menu', customer: 'game' });
    expect(resolveLineup({ cast: 'customers', customer: 'one-star', backdrop: 'scripe' })).toEqual({
      cast: 'customers',
      backdrop: 'scripe',
      customer: 'one-star',
    });
  });

  it.each([
    [{ cast: 'arcade' }, 'lineup: cast must be one of terraria, revised, game, customers, got "arcade"'],
    [
      { cast: 'customers', customer: 'the-manager' },
      'lineup: customer must be one of game, on-the-phone, the-receipt, one-star, got "the-manager"',
    ],
    [{ cast: 'terraria', customer: 'one-star' }, 'lineup: customer is only for the customers cast'],
    [{ backdrop: 'mars' }, 'lineup: backdrop must be one of menu, luna, scripe, got "mars"'],
  ])('rejects %j, naming what it accepts', (params, message) => {
    // The harness passes untrusted JSON, so the types are bypassed on purpose here.
    expect(() => resolveLineup(params as never)).toThrow(new LineupParamsError(message));
  });
});
