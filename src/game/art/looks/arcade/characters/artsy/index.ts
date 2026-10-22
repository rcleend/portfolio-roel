import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import attackPng from './attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * Arcade ARTSY, drawn by tools/looks/arcade/characters. His power strum flings
 * paint that cycles pink, cyan and yellow, each glob with its own splat.
 */
export const look = defineHeroLook('artsy', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
