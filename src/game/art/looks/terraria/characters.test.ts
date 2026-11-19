import { describe, expect, it } from 'vitest';
import { type CharacterId, characters } from '@/content';
import { parseSpriteSheetSpec, type SpriteAnimationSpec, type SpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { PRIMARY_ATTACKS } from '../../../entities/player/attacks';
import { HAND } from '../../../entities/player/size';
import type { LookId } from '../ids';
import type { ImageSheetSource } from '../module';
import { lookRegistry } from '../registry';

/**
 * The Terraria heroes as tools/looks/terraria writes them, timed to the
 * game, in the Terraria look and in its revision's looks beside it:
 * registeredLooks.test.ts holds every look to the hero contract, this to the
 * poses the game holds. Pixels (crisp alpha, feet on the line, one head in
 * every frame, hair that moves only at its loose ends) are checked by the
 * generator's own tests and, in the browser, by e2e/looks.spec.ts.
 */
const TERRARIA_LOOKS: readonly LookId[] = ['terraria', 'terraria-revised', 'terraria-hooded'];

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

async function sheets(lookId: LookId, hero: CharacterId): Promise<{ sheet: SpriteSheetSpec; attack: SpriteSheetSpec }> {
  const look = await lookRegistry.hero(lookId, hero);
  const attack = look.fx.attack as ImageSheetSource | undefined;
  const where = `${lookId}/${hero}`;
  if (!('json' in look.sheet) || !attack) throw new Error(`${where} must ship a sheet and an attack strip`);
  return {
    sheet: parseSpriteSheetSpec(look.sheet.json, `${where}/sheet.json`),
    attack: parseSpriteSheetSpec(attack.json, `${where}/attack.json`),
  };
}

function animation(spec: SpriteSheetSpec, name: string): SpriteAnimationSpec {
  const found = spec.animations.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

const seconds = (spec: SpriteAnimationSpec): number => spec.frames / spec.fps;

/** `skill` and every skill the hero poses his own way (`skill-<skillId>`), each played for one cast, and their upper bodies. */
const skillPoses = (spec: SpriteSheetSpec): SpriteAnimationSpec[] =>
  spec.animations.filter((candidate) => candidate.name === 'skill' || candidate.name.startsWith('skill-'));

/** The row a layer splits, or the row itself if it is whole. */
const whole = (name: string): string => name.replace(/-(legs|upper)$/, '');

/** Every hero each Terraria look draws: all three, or the ENGINEER alone with his hood up. */
const drawn = TERRARIA_LOOKS.flatMap((look) =>
  characters
    .filter((hero) => lookRegistry.offer.characters[hero.id].includes(look))
    .map((hero) => [look, hero.id] as const),
);

describe('the Terraria looks', () => {
  it('draw all three heroes, and the hood only the ENGINEER', () => {
    expect(drawn).toEqual([
      ...characters.map((hero) => ['terraria', hero.id]),
      ...characters.map((hero) => ['terraria-revised', hero.id]),
      ['terraria-hooded', 'hackerman'],
    ]);
  });

  // The revision redraws only heads, so its looks import the Terraria look's attack strips from its folder
  // rather than ship copies: retiring or promoting that look has to carry them over.
  // But for the revised DESIGNER, whose strums fire music notes of his own on the same frames and timing.
  const notes = ([look, hero]: readonly [string, string]): boolean => look === 'terraria-revised' && hero === 'artsy';
  it.each(drawn.filter((entry) => entry[0] !== 'terraria' && !notes(entry)))(
    "%s %s plays the Terraria look's own attack strip",
    async (look, hero) => {
      const [revised, original] = await Promise.all([
        lookRegistry.hero(look, hero),
        lookRegistry.hero('terraria', hero),
      ]);
      expect(revised.fx.attack).toEqual(original.fx.attack);
    },
  );

  it("times the revised DESIGNER's music notes as the Terraria look's paintballs", async () => {
    const [revised, original] = await Promise.all([
      lookRegistry.hero('terraria-revised', 'artsy'),
      lookRegistry.hero('terraria', 'artsy'),
    ]);
    expect(revised.fx.attack).not.toEqual(original.fx.attack);
    const timing = (sheet: typeof revised.fx.attack) =>
      JSON.stringify(sheet, (key, value) => (key === 'image' || key === 'art' ? undefined : value));
    expect(timing(revised.fx.attack)).toBe(timing(original.fx.attack));
  });
});

describe.each(drawn)('the %s %s', (look, hero) => {
  it('loops idle, run, fall and victory and plays the rest once', async () => {
    const { sheet } = await sheets(look, hero);
    for (const spec of sheet.animations) expect(spec.loop, spec.name).toBe(LOOPING.includes(whole(spec.name)));
  });

  it('attacks for exactly one cooldown, and skills and hurts for as long as the game holds them', async () => {
    const { sheet } = await sheets(look, hero);
    expect(seconds(animation(sheet, 'attack'))).toBeCloseTo(PRIMARY_ATTACKS[hero].cooldown, 1);
    for (const pose of skillPoses(sheet)) expect(seconds(pose), pose.name).toBeCloseTo(SKILL_SECONDS, 2);
    expect(seconds(animation(sheet, 'hurt'))).toBeCloseTo(HURT_SECONDS, 2);
  });

  it('marks where every attack frame fires from and every skill frame holds and drinks', async () => {
    const { sheet } = await sheets(look, hero);
    const attack = animation(sheet, 'attack');
    expect(attack.anchors.muzzle).toHaveLength(attack.frames);
    for (const pose of skillPoses(sheet)) {
      expect(pose.anchors.hand, pose.name).toHaveLength(pose.frames);
      expect(pose.anchors.mouth, pose.name).toHaveLength(pose.frames);
    }
  });

  it('marks the top of his head on every frame he is drawn whole or from the waist up, drawn smaller than his frame', async () => {
    const { sheet } = await sheets(look, hero);
    for (const spec of sheet.animations) {
      expect(spec.anchors.head ?? [], spec.name).toHaveLength(spec.name.endsWith('-legs') ? 0 : spec.frames);
    }
    // About classic's 31 px above the feet: the HUD and the skills that clear the head need it.
    const [crown] = animation(sheet, 'idle').anchors.head ?? [];
    expect(sheet.origin.y - (crown?.y ?? 0)).toBeLessThanOrEqual(32);
  });

  it('fires from close to the hand the game shoots from, so a shot is drawn where it hits', async () => {
    const { sheet } = await sheets(look, hero);
    const [muzzle] = animation(sheet, 'attack').anchors.muzzle ?? [];
    if (!muzzle) throw new Error('no muzzle');
    const hand = { x: sheet.origin.x + HAND.reach, y: sheet.origin.y - HAND.height };
    expect(Math.abs(muzzle.x - hand.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(muzzle.y - hand.y)).toBeLessThanOrEqual(4);
  });

  it('poses UX ELIXIR its own way for the DESIGNER, who drinks it, and shares one pose for every other skill', async () => {
    const { sheet } = await sheets(look, hero);
    const own = sheet.animations.map((spec) => whole(spec.name)).filter((name) => name.startsWith('skill-'));
    expect(new Set(own)).toEqual(new Set(hero === 'artsy' ? ['skill-ux-elixir'] : []));
  });

  it('keeps the legs of a run, a jump or a fall under every attack and skill pose, the Terraria way', async () => {
    const { sheet } = await sheets(look, hero);
    const names = sheet.animations.map((spec) => spec.name);
    const poses = names.filter(
      (name) => name === 'attack' || name === 'skill' || /^skill-[a-z-]+(?<!-upper)$/.test(name),
    );
    expect(names.filter((name) => name !== whole(name))).toEqual([
      'run-legs',
      'jump-legs',
      'fall-legs',
      ...poses.map((pose) => `${pose}-upper`),
    ]);
  });

  it('draws a projectile and an impact for spriteAttack, and its variants', async () => {
    const { attack } = await sheets(look, hero);
    expect(attack.animations.map((spec) => spec.name)).toEqual(
      expect.arrayContaining(['projectile', 'impact', ...ATTACK_VARIANTS[hero]]),
    );
  });
});
