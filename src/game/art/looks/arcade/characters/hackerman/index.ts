import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import attackPng from './attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * Arcade HACKERMAN, drawn by tools/looks/arcade/characters. His code bolts take
 * turns with four neon glyphs (`</>`, `{}`, `=>`, `;`) that share one impact and
 * one keystroke muzzle flash.
 */
export const look = defineHeroLook('hackerman', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
