import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import attackPng from './attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/**
 * The Terraria DESIGNER revised, drawn by tools/looks/terraria (kit/revision.py): the look's DESIGNER with
 * only the front spot on his cap, the swept hair pushed out behind it in a tuft, still under the cap as
 * Terraria keeps hair under a hat, and flat panto glasses. Only his head is redrawn; his strums fire music notes
 * (attack.png: eighth and beamed notes in the paintballs' three colours, the same frames and timing, each landing in
 * a little burst of notes), drawn by the captain's request in place of the Terraria look's paintballs.
 */
export const look = defineHeroLook('artsy', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
