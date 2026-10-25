import { describe, expect, it } from 'vitest';
import { parseSpriteSheetSpec, type SpriteAnimationSpec, type SpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { REGULAR_CUSTOMER } from '../../../entities/customer/tuning';
import { lookRegistry } from '../registry';
import { DEFAULT_LOOKS } from '../selection';

/**
 * The Terraria Unhappy Customer as tools/looks/terraria/customer writes it,
 * timed to the game: registeredLooks.test.ts holds every look to the
 * customer contract, this to how long the game holds each mood. Pixels
 * (crisp alpha, feet on the line, one outlined figure) are checked by the
 * generator's own tests.
 */

// Customer.ts knocks a hit customer back for 0.22 s and lets a won-over one cheer for 0.8 s before he strolls off.
const HURT_SECONDS = 0.22;
const CELEBRATE_SECONDS = 0.8;
const LOOPING = ['walk', 'shout', 'stunned', 'happy'];

async function sheet(): Promise<SpriteSheetSpec> {
  const look = await lookRegistry.customer('terraria');
  if (!('json' in look.sheet)) throw new Error('terraria/customer must ship a sheet');
  return parseSpriteSheetSpec(look.sheet.json, 'terraria/customer/sheet.json');
}

function animation(spec: SpriteSheetSpec, name: string): SpriteAnimationSpec {
  const found = spec.animations.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

const seconds = (spec: SpriteAnimationSpec): number => spec.frames / spec.fps;

describe('the Terraria customer', () => {
  it('is offered as the terraria look, and is the one the game draws', () => {
    expect(lookRegistry.offer.customer).toContain('terraria');
    expect(DEFAULT_LOOKS.customer).toBe('terraria');
  });

  it('loops walk, shout, stunned and happy and plays hurt once', async () => {
    const spec = await sheet();
    expect(spec.animations.map((candidate) => candidate.name)).toEqual(['walk', 'shout', 'hurt', 'stunned', 'happy']);
    for (const candidate of spec.animations)
      expect(candidate.loop, candidate.name).toBe(LOOPING.includes(candidate.name));
  });

  it('yells once through the windup, lands from a hit before it ends and hops for as long as he cheers', async () => {
    const spec = await sheet();
    expect(seconds(animation(spec, 'shout'))).toBeCloseTo(REGULAR_CUSTOMER.windup, 2);
    expect(seconds(animation(spec, 'hurt'))).toBeLessThanOrEqual(HURT_SECONDS);
    expect(seconds(animation(spec, 'happy'))).toBeCloseTo(CELEBRATE_SECONDS, 2);
  });

  it('marks his mouth and the top of his head on every frame, the head about classic height above the feet', async () => {
    const spec = await sheet();
    for (const candidate of spec.animations) {
      expect(candidate.anchors.mouth, candidate.name).toHaveLength(candidate.frames);
      expect(candidate.anchors.head, candidate.name).toHaveLength(candidate.frames);
    }
    for (const head of animation(spec, 'walk').anchors.head ?? []) {
      expect(spec.origin.y - head.y).toBeLessThanOrEqual(33);
    }
  });
});
