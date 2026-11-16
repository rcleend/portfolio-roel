import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import { art as attackArt } from './attack.art';
import attackJson from './attack.json';
import { art as sheetArt } from './sheet.art';
import sheetJson from './sheet.json';

/**
 * Terraria DESIGNER, drawn by tools/looks/terraria. Each strum of his white Strat flings a Terraria
 * paintball, pink, cyan and yellow in turn, each with its own splat, and lifts a note off the strings.
 */
export const look = defineHeroLook('artsy', {
  sheet: { art: sheetArt, json: sheetJson },
  fx: { attack: { art: attackArt, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
