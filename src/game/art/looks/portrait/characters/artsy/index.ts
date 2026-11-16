import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import { art as attackArt } from './attack.art';
import attackJson from './attack.json';
import { art as sheetArt } from './sheet.art';
import sheetJson from './sheet.json';

/**
 * Portrait ARTSY: a power strum on the white Strat flings paint. The strip's
 * `projectile`, `projectile-cyan` and `projectile-yellow` take turns, each
 * with its own impact; his `skill` carries `hand`, `guitar` and `mouth` anchors.
 */
export const look = defineHeroLook('artsy', {
  sheet: { art: sheetArt, json: sheetJson },
  fx: { attack: { art: attackArt, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
