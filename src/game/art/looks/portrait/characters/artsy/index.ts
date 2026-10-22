import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import attackPng from './attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * Portrait ARTSY: a power strum on the white Strat flings paint. The strip's
 * `projectile`, `projectile-cyan` and `projectile-yellow` take turns, each
 * with its own impact; his `skill` carries `hand`, `guitar` and `mouth` anchors.
 */
export const look = defineHeroLook('artsy', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
