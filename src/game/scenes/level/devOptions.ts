/**
 * Development-only switches read from the level's harness params, next to
 * the real `LevelParams`:
 *
 *   ?scene=level&params={"levelId":"luna","characterId":"artsy","debug":"hitboxes","startAt":1}
 *
 * - `debug: "hitboxes"` outlines every collision box.
 * - `startAt`: a checkpoint index (0-based) or `"arena"` to skip ahead.
 * - `skipIntro: true` hides the mission intro and control hints.
 * - `autopilot: true` lets the built-in autopilot play (an attract-mode demo),
 *   dismissing highlight cards by itself — for screenshots and end-to-end tests.
 *
 * Unknown or malformed values are ignored: these are conveniences, never
 * part of the game.
 */
export interface LevelDevOptions {
  readonly hitboxes: boolean;
  readonly startAt: number | 'arena' | null;
  readonly skipIntro: boolean;
  readonly autopilot: boolean;
}

export function readDevOptions(params: object): LevelDevOptions {
  const record = params as Record<string, unknown>;
  const startAt = record.startAt;
  return {
    hitboxes: record.debug === 'hitboxes',
    startAt:
      startAt === 'arena' || (typeof startAt === 'number' && Number.isInteger(startAt) && startAt >= 0)
        ? startAt
        : null,
    skipIntro: record.skipIntro === true,
    autopilot: record.autopilot === true,
  };
}
