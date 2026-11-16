import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import { art as attackArt } from '@/game/art/looks/terraria/characters/hackerman/attack.art';
import attackJson from '@/game/art/looks/terraria/characters/hackerman/attack.json';
import { art as sheetArt } from './sheet.art';
import sheetJson from './sheet.json';

/**
 * The Terraria ENGINEER revised, drawn by tools/looks/terraria (kit/revision.py): the look's ENGINEER under
 * hairstyle 143's swept mop, whose lock flicks a pixel as he runs and lifts as he falls, and flat panto
 * glasses. Only his head is redrawn, so he types the Terraria look's own glyphs, imported from its folder
 * (characters.test.ts holds the revision to them).
 */
export const look = defineHeroLook('hackerman', {
  sheet: { art: sheetArt, json: sheetJson },
  fx: { attack: { art: attackArt, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
