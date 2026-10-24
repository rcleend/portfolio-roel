import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from '@/game/art/looks/terraria/characters/hackerman/attack.json';
import attackPng from '@/game/art/looks/terraria/characters/hackerman/attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * The revised Terraria ENGINEER with his black hood pulled up, drawn by tools/looks/terraria
 * (kit/revision.py): the hood moves with his head and shoulders as one, and the hair under it is still, as
 * Terraria keeps hair under headgear. The look covers him alone; he types the Terraria look's own glyphs,
 * imported from its folder (characters.test.ts holds the revision to them).
 */
export const look = defineHeroLook('hackerman', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
