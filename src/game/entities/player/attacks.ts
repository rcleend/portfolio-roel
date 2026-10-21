import type { CharacterId } from '@/content';
import type { SfxId } from '../../audio/ids';
import { CodeBolt } from '../shots/CodeBolt';
import { PAINTS, PaintSplat } from '../shots/PaintSplat';
import type { Shot } from '../shots/Shot';
import { StickyNote } from '../shots/StickyNote';

/** A character's primary attack (src/content characters[].attack). */
export interface PrimaryAttack {
  /** Seconds between shots while the button is held. */
  readonly cooldown: number;
  readonly sfx: SfxId;
  /** Spawns this attack's shot from the hand at (x, y). `count` is the number of shots fired so far. */
  fire(x: number, y: number, facing: -1 | 1, count: number): Shot;
}

export const PRIMARY_ATTACKS: Readonly<Record<CharacterId, PrimaryAttack>> = {
  hackerman: {
    cooldown: 0.22,
    sfx: 'attack-code',
    fire: (x, y, facing) => new CodeBolt(x, y, facing),
  },
  artsy: {
    cooldown: 0.3,
    sfx: 'attack-paint',
    fire: (x, y, facing, count) => new PaintSplat(x, y, facing, PAINTS[count % PAINTS.length] ?? PAINTS[0]),
  },
  strategy: {
    cooldown: 0.22,
    sfx: 'attack-note',
    fire: (x, y, facing) => new StickyNote(x, y, facing),
  },
};
