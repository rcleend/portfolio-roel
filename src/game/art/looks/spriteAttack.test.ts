import { describe, expect, it } from 'vitest';
import type { PixelImage } from '@/engine/gfx/canvas';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import type { RenderKit } from '../../entities/RenderKit';
import type { AttackImpactView, AttackShotView } from '../../entities/shots/AttackVisual';
import { spriteAttack } from './spriteAttack';

const strip = (animations: readonly { name: string; frames: number; loop: boolean }[]) => {
  const spec = parseSpriteSheetSpec(
    { frame: { w: 16, h: 16 }, origin: { x: 8, y: 8 }, animations: animations.map((a) => ({ ...a, fps: 10 })) },
    'attack.json',
  );
  // Only the size of the image matters: the recording Gfx below never draws it.
  const image = { width: 16 * Math.max(...animations.map((a) => a.frames)), height: 16 * animations.length };
  return SpriteSheet.fromImage(image as PixelImage, spec, 'attack');
};

const ATTACK = strip([
  { name: 'projectile', frames: 2, loop: true },
  { name: 'impact', frames: 3, loop: false },
  { name: 'muzzle', frames: 2, loop: false },
  { name: 'projectile-cyan', frames: 2, loop: true },
  { name: 'impact-cyan', frames: 3, loop: false },
  { name: 'projectile-yellow', frames: 2, loop: true },
  { name: 'muzzle-yellow', frames: 2, loop: false },
]);

interface SpriteCall {
  readonly animation: string;
  readonly x: number;
  readonly y: number;
  readonly flipX: boolean;
}

/** A Gfx that records the sprites drawn through it; a sprite strip draws nothing else. */
function recording(): { readonly gfx: Gfx; readonly calls: SpriteCall[] } {
  const calls: SpriteCall[] = [];
  const sprite: Gfx['sprite'] = (_sheet, animation, _time, x, y, options) => {
    calls.push({ animation, x, y, flipX: options?.flipX ?? false });
  };
  return { gfx: { sprite } as Pick<Gfx, 'sprite'> as Gfx, calls };
}

/** Strips draw from their own sheet and never read the kit. */
const kit = {} as RenderKit;

const shot = (index: number, age: number, direction: -1 | 1 = 1): AttackShotView => ({
  x: 100,
  y: 50,
  vx: direction * 200,
  vy: 0,
  age,
  direction,
  index,
  from: { x: 90, y: 52 },
});

const impact = (age: number, direction: -1 | 1, index = 0): AttackImpactView => ({
  x: 140,
  y: 50,
  age,
  particles: [],
  size: 1,
  direction,
  index,
});

describe('spriteAttack', () => {
  it('takes turns between the projectile and its variants, shot by shot, in sheet order', () => {
    const { gfx, calls } = recording();
    const visual = spriteAttack(ATTACK);
    for (const index of [0, 1, 2, 3]) visual.shot(gfx, shot(index, 1), kit);
    expect(calls.map((call) => call.animation)).toEqual([
      'projectile',
      'projectile-cyan',
      'projectile-yellow',
      'projectile',
    ]);
  });

  it("plays a variant's own impact and muzzle where the strip has them, and the plain ones otherwise", () => {
    const { gfx, calls } = recording();
    const visual = spriteAttack(ATTACK);
    for (const index of [1, 2]) {
      visual.shot(gfx, shot(index, 0), kit);
      visual.impact(gfx, impact(0, 1, index), kit);
    }
    expect(calls.map((call) => call.animation)).toEqual([
      'muzzle',
      'projectile-cyan',
      'impact-cyan',
      'muzzle-yellow',
      'projectile-yellow',
      'impact',
    ]);
  });

  it('plays the muzzle once where the shot left the hand, behind the projectile', () => {
    const { gfx, calls } = recording();
    const visual = spriteAttack(ATTACK);
    visual.shot(gfx, shot(0, 0.1, -1), kit);
    expect(calls).toEqual([
      { animation: 'muzzle', x: 90, y: 52, flipX: true },
      { animation: 'projectile', x: 100, y: 50, flipX: true },
    ]);
    calls.length = 0;
    visual.shot(gfx, shot(0, 0.2, -1), kit);
    expect(calls.map((call) => call.animation)).toEqual(['projectile']);
  });

  it('plays the impact once, facing the way the shot flew, and adds nothing on the customer it hit', () => {
    const { gfx, calls } = recording();
    const visual = spriteAttack(ATTACK);
    visual.impact(gfx, impact(0.25, -1), kit);
    visual.impact(gfx, impact(0.3, 1), kit);
    visual.hit(gfx, impact(0, 1), kit);
    expect(calls).toEqual([{ animation: 'impact', x: 140, y: 50, flipX: true }]);
  });

  it('refuses a strip without a projectile and an impact', () => {
    const projectileOnly = strip([{ name: 'projectile', frames: 1, loop: true }]);
    expect(() => spriteAttack(projectileOnly)).toThrow('attack: an attack strip needs a "projectile" and an "impact"');
  });
});
