import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { type HeartAnimation, heartSheet } from './hearts';
import {
  type CodeBoltAnimation,
  codeBoltSheet,
  type DroneAnimation,
  droneSheet,
  type StarAnimation,
  type StickyNoteAnimation,
  starSheet,
  stickyNoteSheet,
} from './projectiles';

/** Compiled effect and projectile sheets used by the level. */
export interface FxSprites {
  readonly codeBolt: SpriteSheet<CodeBoltAnimation>;
  readonly stickyNote: SpriteSheet<StickyNoteAnimation>;
  readonly star: SpriteSheet<StarAnimation>;
  readonly drone: SpriteSheet<DroneAnimation>;
  readonly heart: SpriteSheet<HeartAnimation>;
}

let compiled: FxSprites | null = null;

/** Compiles the sheets on first use (compiling needs a canvas, so never at import time) and caches them. */
export function fxSprites(): FxSprites {
  compiled ??= {
    codeBolt: SpriteSheet.compile(codeBoltSheet, 'fx/code-bolt'),
    stickyNote: SpriteSheet.compile(stickyNoteSheet, 'fx/sticky-note'),
    star: SpriteSheet.compile(starSheet, 'fx/star'),
    drone: SpriteSheet.compile(droneSheet, 'fx/drone'),
    heart: SpriteSheet.compile(heartSheet, 'fx/heart'),
  };
  return compiled;
}

export { codeBoltSheet, droneSheet, heartSheet, starSheet, stickyNoteSheet };
