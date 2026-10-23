import { defineHeroLook } from '@/game/art/looks/module';
import { spriteAttack } from '@/game/art/looks/spriteAttack';
import attackJson from './attack.json';
import attackPng from './attack.png';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/** Arcade STRATEGY, drawn by tools/looks/arcade/characters: a sticky note flicked like a shuriken. */
export const look = defineHeroLook('strategy', {
  sheet: { png: sheetPng, json: sheetJson },
  fx: { attack: { png: attackPng, json: attackJson } },
  attack: (fx) => spriteAttack(fx.attack),
});
