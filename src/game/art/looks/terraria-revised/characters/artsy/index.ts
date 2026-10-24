import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from '@/game/art/looks/terraria/characters/artsy/attack.json';
import attackPng from '@/game/art/looks/terraria/characters/artsy/attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * The Terraria DESIGNER revised, drawn by tools/looks/terraria (kit/revision.py): the look's DESIGNER with
 * only the front spot on his cap, the swept hair pushed out behind it in a tuft, and flat panto glasses.
 * Only his head is redrawn, so he strums the Terraria look's own paintballs, imported from its folder
 * (characters.test.ts holds the revision to them).
 */
export const look = defineHeroLook('artsy', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
