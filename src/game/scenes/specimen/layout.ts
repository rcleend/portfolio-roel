/**
 * Where the specimen's sprite pages put things, from the size of the art on
 * show. Classic's sizes give the original layout; a look with taller sprites
 * or bigger icons spreads out instead of overlapping.
 */

const SCREEN_HEIGHT = 240;

/** Page 1: one row per hero. A row is the sheet plus a name line under the feet. */
export interface HeroRows {
  readonly firstFeet: number;
  readonly pitch: number;
}

export function heroRows(sheetHeight: number): HeroRows {
  // Frames may reach into the row above by their empty headroom, never the figures.
  return { firstFeet: Math.max(72, sheetHeight + 21), pitch: Math.max(56, sheetHeight + 7) };
}

/** Page 2: the customer's animations above a grid of skill icons. */
export interface EnemyPage {
  /** Feet line of the customer row(s): two (as drawn, then flipped and hit-flashed) or, for tall art, one that alternates. */
  readonly customerFeet: readonly number[];
  readonly captionY: number;
  readonly iconsTop: number;
  readonly iconPitch: number;
}

const ICON_ROWS = 3;

export function enemyPage(customerHeight: number, slotSize: number): EnemyPage {
  const firstFeet = Math.max(78, customerHeight + 24);
  const pitch = Math.max(50, customerHeight + 2);
  const iconPitch = slotSize + 4;
  const below = (feet: number) => ({ captionY: feet + 4, iconsTop: feet + 18 });
  const twoRows = below(firstFeet + pitch);
  if (twoRows.iconsTop + ICON_ROWS * iconPitch - 4 <= SCREEN_HEIGHT) {
    return { customerFeet: [firstFeet, firstFeet + pitch], ...twoRows, iconPitch };
  }
  return { customerFeet: [firstFeet], ...below(firstFeet), iconPitch };
}
