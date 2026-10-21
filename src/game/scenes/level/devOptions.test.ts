import { describe, expect, it } from 'vitest';
import { readDevOptions } from './devOptions';

describe('readDevOptions', () => {
  it('reads the debug switches next to the level params', () => {
    const params = {
      levelId: 'luna',
      characterId: 'artsy',
      debug: 'hitboxes',
      startAt: 1,
      skipIntro: true,
      autopilot: true,
    };
    expect(readDevOptions(params)).toEqual({ hitboxes: true, startAt: 1, skipIntro: true, autopilot: true });
    expect(readDevOptions({ startAt: 'arena' }).startAt).toBe('arena');
  });

  it('ignores anything malformed', () => {
    expect(readDevOptions({ debug: 'yes', startAt: -2, skipIntro: 'true', autopilot: 1 })).toEqual({
      hitboxes: false,
      startAt: null,
      skipIntro: false,
      autopilot: false,
    });
  });
});
