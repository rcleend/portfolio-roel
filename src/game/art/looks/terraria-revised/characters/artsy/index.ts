import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import { art as attackArt } from './attack.art';
import attackJson from './attack.json';
import { art as sheetArt } from './sheet.art';
import sheetJson from './sheet.json';

/**
 * The Terraria DESIGNER revised, drawn by tools/looks/terraria (kit/revision.py): the look's DESIGNER with
 * only the front spot on his cap, the swept hair pushed out behind it in a tuft, still under the cap as
 * Terraria keeps hair under a hat, and flat panto glasses. Only his head is redrawn; his strums fire music notes
 * (attack.art: eighth and beamed notes in the paintballs' three colours, the same frames and timing, each landing in
 * a little burst of notes), drawn by the captain's request in place of the Terraria look's paintballs.
 */
export const look = defineHeroLook('artsy', {
  sheet: { art: sheetArt, json: sheetJson },
  fx: { attack: { art: attackArt, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
