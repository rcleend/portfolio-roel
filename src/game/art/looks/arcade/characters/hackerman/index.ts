import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import { art as attackArt } from './attack.art';
import attackJson from './attack.json';
import { art as sheetArt } from './sheet.art';
import sheetJson from './sheet.json';

/**
 * Arcade HACKERMAN, drawn by tools/looks/arcade/characters. His code bolts take
 * turns with four neon glyphs (`</>`, `{}`, `=>`, `;`) that share one impact and
 * one keystroke muzzle flash.
 */
export const look = defineHeroLook('hackerman', {
  sheet: { art: sheetArt, json: sheetJson },
  fx: { attack: { art: attackArt, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
