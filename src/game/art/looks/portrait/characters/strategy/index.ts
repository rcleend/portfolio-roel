import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import { art as attackArt } from './attack.art';
import attackJson from './attack.json';
import { art as sheetArt } from './sheet.art';
import sheetJson from './sheet.json';

/** Portrait STRATEGY: sticky notes flicked off his pad like shuriken. */
export const look = defineHeroLook('strategy', {
  sheet: { art: sheetArt, json: sheetJson },
  fx: { attack: { art: attackArt, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
