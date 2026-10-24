import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import attackPng from './attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * Terraria ENGINEER, drawn by tools/looks/terraria. He summons a chunky keyboard to type on, and his
 * `</>` takes turns with `{}`, `=>` and `;`, every glyph bursting into green motes where it lands.
 */
export const look = defineHeroLook('hackerman', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
