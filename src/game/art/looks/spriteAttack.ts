import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { AttackVisual } from '../../entities/shots/AttackVisual';

export const ATTACK_STRIP_ANIMATIONS = ['projectile', 'impact'] as const;

/**
 * The attack visual most looks need, drawn from one `attack.png` strip whose
 * origin is the projectile's centre:
 *
 * - `projectile` loops with the shot; any `projectile-<name>` animations are
 *   variants that successive shots take turns with, in sheet order;
 * - `impact` plays once where a shot ends;
 * - `muzzle`, if the strip has one, plays once where each shot leaves the hand.
 *
 * Everything faces the way the shot flew.
 */
export function spriteAttack(sheet: SpriteSheet): AttackVisual {
  const strip = sheet.hasAll(ATTACK_STRIP_ANIMATIONS) ? sheet : null;
  if (!strip) throw new Error(`${sheet.name}: an attack strip needs a "projectile" and an "impact" animation`);
  const projectiles = sheet.animationNames.filter((name) => name === 'projectile' || name.startsWith('projectile-'));
  const muzzle = sheet.has('muzzle') ? 'muzzle' : null;
  return {
    shot: (gfx, shot) => {
      const flipX = shot.direction < 0;
      if (muzzle && !sheet.isFinished(muzzle, shot.age)) {
        gfx.sprite(sheet, muzzle, shot.age, shot.from.x, shot.from.y, { flipX });
      }
      const projectile = projectiles[shot.index % projectiles.length] ?? 'projectile';
      gfx.sprite(sheet, projectile, shot.age, shot.x, shot.y, { flipX });
    },
    impact: (gfx, impact) => {
      if (strip.isFinished('impact', impact.age)) return;
      gfx.sprite(strip, 'impact', impact.age, impact.x, impact.y, { flipX: impact.direction < 0 });
    },
    // The impact plays where the shot struck; the customer it hit needs nothing more.
    hit: () => {},
  };
}
