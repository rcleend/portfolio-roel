import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from '@/game/art/looks/terraria/characters/strategy/attack.json';
import attackPng from '@/game/art/looks/terraria/characters/strategy/attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * The Terraria STRATEGIST revised, drawn by tools/looks/terraria (kit/revision.py): the look's STRATEGIST
 * under hairstyle 143's swept mop, whose lock flicks a pixel as he runs and lifts as he falls, and flat panto
 * glasses. Only his head is redrawn, so he throws the Terraria look's own sticky notes, imported from its
 * folder (characters.test.ts holds the revision to them).
 */
export const look = defineHeroLook('strategy', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
