import type { SkillId } from '@/content';
import type { SfxId } from '../audio/ids';

/**
 * What happened in the world during a step, for the level scene to turn
 * into sound, overlays and flow. The world never talks to audio or the
 * director itself, which keeps it deterministic and easy to test.
 */
export type WorldEvent =
  | { readonly kind: 'sfx'; readonly id: SfxId }
  | { readonly kind: 'highlight'; readonly highlightId: string }
  | { readonly kind: 'customerWon'; readonly mrr: number; readonly escalated: boolean }
  | { readonly kind: 'checkpoint'; readonly index: number }
  /** The player fell into a pit or ran out of hearts; the scene fades and calls `respawn`. */
  | { readonly kind: 'playerDown'; readonly reason: 'pit' | 'hearts' }
  | { readonly kind: 'skillCast'; readonly skillId: SkillId }
  | { readonly kind: 'arenaEntered' }
  | { readonly kind: 'bossLanded' }
  | { readonly kind: 'bossRetained' };
