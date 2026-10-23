import type { CharacterId } from '@/content';
import type { SfxId } from '../../audio/ids';
import type { ShotSpec } from '../shots/Shot';

/**
 * A character's primary attack (src/content characters[].attack): how its
 * shots fly and hit. How they look belongs to the hero's look.
 */
export interface PrimaryAttack {
  /** Seconds between shots while the button is held. */
  readonly cooldown: number;
  readonly sfx: SfxId;
  readonly shot: ShotSpec;
  /** Launch velocity in px/s, x pointing away from the hero. */
  readonly launch: { readonly x: number; readonly y: number };
  /** Downward pull in px/s²: paint arcs, bolts and notes fly straight. */
  readonly gravity: number;
}

export const PRIMARY_ATTACKS: Readonly<Record<CharacterId, PrimaryAttack>> = {
  // A fast, straight "</>".
  hackerman: {
    cooldown: 0.22,
    sfx: 'attack-code',
    shot: { w: 12, h: 6, damage: 1, life: 0.75, pierces: false, impact: 'spark' },
    launch: { x: 270, y: 0 },
    gravity: 0,
  },
  // A lobbed blob of paint on a short arc; it hits a little harder to make up for the range.
  artsy: {
    cooldown: 0.3,
    sfx: 'attack-paint',
    shot: { w: 7, h: 7, damage: 1.5, life: 1.2, pierces: false, impact: 'paint' },
    launch: { x: 175, y: -150 },
    gravity: 720,
  },
  // A sticky note thrown flat.
  strategy: {
    cooldown: 0.22,
    sfx: 'attack-note',
    shot: { w: 8, h: 8, damage: 1, life: 0.85, pierces: false, impact: 'note' },
    launch: { x: 215, y: 0 },
    gravity: 0,
  },
};
