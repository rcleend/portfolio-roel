import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { AttackVisual } from '../../entities/shots/AttackVisual';

export const ATTACK_STRIP_ANIMATIONS = ['projectile', 'impact'] as const;

const VARIANT_PREFIX = 'projectile-';

/** The animations one shot plays: its projectile, its impact and, if the strip has one, its muzzle flash. */
interface ShotAnimations {
  readonly projectile: string;
  readonly impact: string;
  readonly muzzle: string | null;
}

/**
 * The attack visual most looks need, drawn from one `attack.png` strip whose
 * origin is the projectile's centre:
 *
 * - `projectile` loops with the shot;
 * - `impact` plays once where a shot ends;
 * - `muzzle`, if the strip has one, plays once where each shot leaves the hand.
 *
 * A strip may vary its shots: each `projectile-<variant>` is a variant that
 * successive shots take turns with, after the plain `projectile`, in sheet
 * order. A variant's shot plays `impact-<variant>` and `muzzle-<variant>`
 * where the strip has them, the plain ones otherwise. Everything faces the
 * way the shot flew.
 */
export function spriteAttack(sheet: SpriteSheet): AttackVisual {
  // Checked by name rather than narrowed with `hasAll`: variants are found by name too.
  if (!ATTACK_STRIP_ANIMATIONS.every((name) => sheet.has(name))) {
    throw new Error(`${sheet.name}: an attack strip needs a "projectile" and an "impact" animation`);
  }
  const plain: ShotAnimations = { projectile: 'projectile', impact: 'impact', muzzle: orElse(sheet, 'muzzle', null) };
  const turns = [
    plain,
    ...sheet.animationNames
      .filter((name) => name.startsWith(VARIANT_PREFIX))
      .map((name): ShotAnimations => {
        const variant = name.slice(VARIANT_PREFIX.length);
        return {
          projectile: name,
          impact: orElse(sheet, `impact-${variant}`, plain.impact),
          muzzle: orElse(sheet, `muzzle-${variant}`, plain.muzzle),
        };
      }),
  ];
  const turnOf = (index: number): ShotAnimations => turns[index % turns.length] ?? plain;
  return {
    shot: (gfx, shot) => {
      const { projectile, muzzle } = turnOf(shot.index);
      const flipX = shot.direction < 0;
      if (muzzle && !sheet.isFinished(muzzle, shot.age)) {
        gfx.sprite(sheet, muzzle, shot.age, shot.from.x, shot.from.y, { flipX });
      }
      gfx.sprite(sheet, projectile, shot.age, shot.x, shot.y, { flipX });
    },
    impact: (gfx, impact) => {
      const { impact: animation } = turnOf(impact.index);
      if (sheet.isFinished(animation, impact.age)) return;
      gfx.sprite(sheet, animation, impact.age, impact.x, impact.y, { flipX: impact.direction < 0 });
    },
    // The impact plays where the shot struck; the customer it hit needs nothing more.
    hit: () => {},
  };
}

/** `name` if the strip has an animation by that name, `fallback` if not. */
function orElse<F extends string | null>(sheet: SpriteSheet, name: string, fallback: F): string | F {
  return sheet.has(name) ? name : fallback;
}
