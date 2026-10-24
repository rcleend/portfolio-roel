import { characters, type SkillId, skills } from '@/content';
import type { PixelImage } from '@/engine/gfx/canvas';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { SpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { CHARACTER_ANIMATIONS, CUSTOMER_ANIMATIONS, type HeroAnimation, SKILL_ICON_ANIMATIONS } from './contracts';
import type { HeroLook, Looks, SkillLooks } from './Looks';
import { DEFAULT_LOOKS } from './selection';

/** Frame sizes for `sizedLooks`; the defaults are classic's. */
export interface LookSizes {
  readonly hero: number;
  readonly customer: number;
  readonly icon: number;
}

const CLASSIC_SIZES: LookSizes = { hero: 40, customer: 40, icon: 16 };

/**
 * Looks of the given sizes that draw nothing, for tests that lay out or step
 * scenes without a canvas. Lives next to the looks so every test can share it;
 * production code never imports it.
 */
export function sizedLooks(sizes: LookSizes = CLASSIC_SIZES): Looks {
  const hero = blankSheet<HeroAnimation>(CHARACTER_ANIMATIONS, sizes.hero, {
    x: Math.floor(sizes.hero / 2),
    y: sizes.hero,
  });
  const customer = blankSheet(CUSTOMER_ANIMATIONS, sizes.customer, {
    x: Math.floor(sizes.customer / 2),
    y: sizes.customer,
  });
  const icon = blankSheet(SKILL_ICON_ANIMATIONS, sizes.icon, { x: 0, y: 0 });
  const heroLook: HeroLook = {
    lookId: 'classic',
    sheet: hero,
    attack: { shot: () => {}, impact: () => {}, hit: () => {} },
  };
  return {
    selection: DEFAULT_LOOKS,
    characters: Object.fromEntries(characters.map((character) => [character.id, heroLook])) as Looks['characters'],
    customer: { lookId: 'classic', sheet: customer },
    skills: Object.fromEntries(
      (Object.keys(skills) as SkillId[]).map((id) => [id, { lookId: 'classic', icon, visual: {} }]),
    ) as SkillLooks,
  };
}

/** A square sheet playing `animations` one frame each, over an image that is never drawn. */
function blankSheet<A extends string>(
  animations: readonly A[],
  size: number,
  origin: { x: number; y: number },
): SpriteSheet<A> {
  const spec: SpriteSheetSpec = {
    frame: { w: size, h: size },
    origin,
    animations: animations.map((name) => ({ name, fps: 1, loop: true, frames: 1, anchors: {} })),
  };
  const image = { width: size, height: size * animations.length } as PixelImage;
  const sheet = SpriteSheet.fromImage(image, spec, `blank-${size}`);
  if (!sheet.hasAll(animations)) throw new Error('unreachable: the spec lists every animation');
  return sheet;
}
