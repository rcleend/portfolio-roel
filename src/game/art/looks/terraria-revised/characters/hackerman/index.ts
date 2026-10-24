import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from '@/game/art/looks/terraria/characters/hackerman/attack.json';
import attackPng from '@/game/art/looks/terraria/characters/hackerman/attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * The Terraria ENGINEER revised, drawn by tools/looks/terraria (kit/revision.py): the look's ENGINEER under
 * hairstyle 143's swept mop, with flat panto glasses. Only his head is redrawn, so he types the Terraria
 * look's own glyphs, imported from its folder (characters.test.ts holds the revision to them).
 */
export const look = defineHeroLook('hackerman', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
