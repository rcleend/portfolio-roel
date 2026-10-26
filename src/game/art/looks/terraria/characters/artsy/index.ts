import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import attackPng from './attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * Terraria DESIGNER, drawn by tools/looks/terraria. Each strum of his white Strat flings a Terraria
 * paintball, pink, cyan and yellow in turn, each with its own splat, and lifts a note off the strings.
 */
export const look = defineHeroLook('artsy', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
