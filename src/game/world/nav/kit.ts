import { MOVEMENT, NORMAL_SCALE, PlatformerMotor } from '../../entities/player/movement';
import { IDLE_INTENT } from '../../entities/player/Player';
import { PLAYER_SIZE } from '../../entities/player/size';
import { TILE } from '../grid';
import { GRID_ORIGIN_Y, GROUND_Y } from '../map/buildGrid';

/**
 * What mouse play walks with, all of it already in the first load, handed over rather than imported: a runtime
 * import from mouse play's lazy chunk would split the game's shared modules into common chunks on the critical path
 * (some 2 kB of gzip, measured), as a lazy room chunk would three.js (src/room/posters/posterKit.ts). The nav and
 * mouse modules import types only; scripts/bundle-report.mjs's mousePlay row holds the chunk to that.
 */
export const navKit = {
  MOVEMENT,
  NORMAL_SCALE,
  PlatformerMotor,
  IDLE_INTENT,
  PLAYER_SIZE,
  TILE,
  GRID_ORIGIN_Y,
  GROUND_Y,
} as const;

export type NavKit = typeof navKit;
