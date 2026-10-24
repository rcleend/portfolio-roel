import { describe, expect, it } from 'vitest';
import { type CharacterId, characters } from '@/content';
import { parseSpriteSheetSpec, type SpriteAnimationSpec, type SpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { PRIMARY_ATTACKS } from '../../../entities/player/attacks';
import { HAND } from '../../../entities/player/size';
import type { ImageSheetSource } from '../module';
import { lookRegistry } from '../registry';

/**
 * The Terraria heroes as tools/looks/terraria writes them, timed to the
 * game: registeredLooks.test.ts holds every look to the hero contract, this
 * to the poses the game holds. Pixels (crisp alpha, feet on the line, one
 * head in every frame) are checked by the generator's own tests and, in the
 * browser, by e2e/looks.spec.ts.
 */

// How long the game holds the poses that play once: World strikes a skill for 0.4 s and Player is
// knocked back for 0.3 s; an attack lasts its cooldown, because held fire strikes it again each shot.
const SKILL_SECONDS = 0.4;
const HURT_SECONDS = 0.3;
const LOOPING = ['idle', 'run', 'fall', 'victory'];
const ATTACK_VARIANTS = {
  hackerman: ['projectile-braces', 'projectile-arrow', 'projectile-semicolon'],
  artsy: ['projectile-cyan', 'projectile-yellow'],
  strategy: [],
} as const;

async function sheets(hero: CharacterId): Promise<{ sheet: SpriteSheetSpec; attack: SpriteSheetSpec }> {
  const look = await lookRegistry.hero('terraria', hero);
  const attack = look.fx.attack as ImageSheetSource | undefined;
  if (!('json' in look.sheet) || !attack) throw new Error(`terraria/${hero} must ship a sheet and an attack strip`);
  return {
    sheet: parseSpriteSheetSpec(look.sheet.json, `terraria/${hero}/sheet.json`),
    attack: parseSpriteSheetSpec(attack.json, `terraria/${hero}/attack.json`),
  };
}

function animation(spec: SpriteSheetSpec, name: string): SpriteAnimationSpec {
  const found = spec.animations.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

const seconds = (spec: SpriteAnimationSpec): number => spec.frames / spec.fps;

describe.each(characters.map((hero) => hero.id))('the Terraria %s', (hero) => {
  it('loops idle, run, fall and victory and plays the rest once', async () => {
    const { sheet } = await sheets(hero);
    for (const spec of sheet.animations) expect(spec.loop, spec.name).toBe(LOOPING.includes(spec.name));
  });

  it('attacks for exactly one cooldown, and skills and hurts for as long as the game holds them', async () => {
    const { sheet } = await sheets(hero);
    expect(seconds(animation(sheet, 'attack'))).toBeCloseTo(PRIMARY_ATTACKS[hero].cooldown, 1);
    expect(seconds(animation(sheet, 'skill'))).toBeCloseTo(SKILL_SECONDS, 2);
    expect(seconds(animation(sheet, 'hurt'))).toBeCloseTo(HURT_SECONDS, 2);
  });

  it('marks where every attack frame fires from and every skill frame holds and drinks', async () => {
    const { sheet } = await sheets(hero);
    const attack = animation(sheet, 'attack');
    expect(attack.anchors.muzzle).toHaveLength(attack.frames);
    const skill = animation(sheet, 'skill');
    expect(skill.anchors.hand).toHaveLength(skill.frames);
    expect(skill.anchors.mouth).toHaveLength(skill.frames);
  });

  it('marks the top of his head on every frame, drawn smaller than his frame as he is', async () => {
    const { sheet } = await sheets(hero);
    for (const spec of sheet.animations) expect(spec.anchors.head, spec.name).toHaveLength(spec.frames);
    // About classic's 31 px above the feet: the HUD and the skills that clear the head need it.
    const [crown] = animation(sheet, 'idle').anchors.head ?? [];
    expect(sheet.origin.y - (crown?.y ?? 0)).toBeLessThanOrEqual(32);
  });

  it('fires from close to the hand the game shoots from, so a shot is drawn where it hits', async () => {
    const { sheet } = await sheets(hero);
    const [muzzle] = animation(sheet, 'attack').anchors.muzzle ?? [];
    if (!muzzle) throw new Error('no muzzle');
    const hand = { x: sheet.origin.x + HAND.reach, y: sheet.origin.y - HAND.height };
    expect(Math.abs(muzzle.x - hand.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(muzzle.y - hand.y)).toBeLessThanOrEqual(4);
  });

  it('draws a projectile and an impact for spriteAttack, and its variants', async () => {
    const { attack } = await sheets(hero);
    expect(attack.animations.map((spec) => spec.name)).toEqual(
      expect.arrayContaining(['projectile', 'impact', ...ATTACK_VARIANTS[hero]]),
    );
  });
});
