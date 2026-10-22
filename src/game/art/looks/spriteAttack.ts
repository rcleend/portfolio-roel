import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { AttackVisual } from '../../entities/shots/AttackVisual';

export const ATTACK_STRIP_ANIMATIONS = ['projectile', 'impact'] as const;

/**
 * The attack visual most looks need, drawn from one `attack.png` strip: its
 * looping `projectile` animation flies with the shot and its one-shot
 * `impact` plays where the shot strikes, both facing the way the shot flew.
 * Put the strip's origin at the projectile's centre.
 */
export function spriteAttack(sheet: SpriteSheet): AttackVisual {
  const strip = sheet.hasAll(ATTACK_STRIP_ANIMATIONS) ? sheet : null;
  if (!strip) throw new Error(`${sheet.name}: an attack strip needs a "projectile" and an "impact" animation`);
  return {
    shot: (gfx, shot) => gfx.sprite(strip, 'projectile', shot.age, shot.x, shot.y, { flipX: shot.direction < 0 }),
    impact: (gfx, impact) => {
      if (strip.isFinished('impact', impact.age)) return;
      gfx.sprite(strip, 'impact', impact.age, impact.x, impact.y, { flipX: impact.direction < 0 });
    },
  };
}
