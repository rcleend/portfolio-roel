import type { SfxRecipe } from '@/engine/audio/sfx/recipe';
import type { SfxId } from '../ids';
import { attackCode, attackNote, attackPaint, explosion, flash, hit, hurt, jump, land } from './action';
import { complaint, customerHappy } from './customers';
import { achievement, checkpoint, stageClear } from './rewards';
import { agentSummon, churnShield, fullStack, northStar, powerChord, uxElixir } from './skills';
import { coin, menuBack, menuConfirm, menuMove, pause, powerOn, typewriter } from './ui';

/** Every sound effect, keyed by id. */
export const sfx: Readonly<Record<SfxId, SfxRecipe>> = {
  'power-on': powerOn,
  coin,
  'menu-move': menuMove,
  'menu-confirm': menuConfirm,
  'menu-back': menuBack,
  typewriter,
  explosion,
  flash,
  jump,
  land,
  'attack-code': attackCode,
  'attack-paint': attackPaint,
  'attack-note': attackNote,
  'skill-full-stack': fullStack,
  'skill-agent': agentSummon,
  'skill-elixir': uxElixir,
  'skill-power-chord': powerChord,
  'skill-north-star': northStar,
  'skill-shield': churnShield,
  hit,
  hurt,
  complaint,
  'customer-happy': customerHappy,
  achievement,
  checkpoint,
  pause,
  'stage-clear': stageClear,
};
