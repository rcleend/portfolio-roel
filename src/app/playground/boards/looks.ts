import { type Character, type CharacterId, characters, type SkillId, skills } from '@/content';
import { STEP_HZ } from '@/engine/core/FixedLoop';
import { isLookId, type LookId } from '@/game/art/looks/ids';
import { lookRegistry } from '@/game/art/looks/registry';
import { DEFAULT_LOOKS } from '@/game/art/looks/selection';
import type { ShowcaseParams } from '@/game/scenes/params';
import { resolveShowcase } from '@/game/scenes/showcase/params';
import type { Board } from './board';
import type { Choice, Picker, Picks, Subject } from './subject';
import type { Timeline } from './timeline';

/** Each look as docs/LOOKS.md describes it. */
const LOOKS: Readonly<Record<LookId, Choice>> = {
  classic: { id: 'classic', name: 'Classic', description: 'The art the game shipped with: pixel art drawn in code.' },
  arcade: {
    id: 'arcade',
    name: 'Arcade',
    description: 'Neo Geo and Metal Slug: a near-black outline and bold cel shading.',
  },
  portrait: { id: 'portrait', name: 'Portrait', description: 'Slim and realistic, with selective coloured outlines.' },
  hibit: { id: 'hibit', name: 'Hi-bit', description: 'Modern high-fidelity pixel art: rich ramps and lavish effects.' },
  terraria: {
    id: 'terraria',
    name: 'Terraria',
    description: 'The three Roels as Terraria players, animated the way Terraria animates its own.',
  },
};

/** The looks each piece has been drawn in: a look shows up as soon as its folder is registered. */
const { offer } = lookRegistry;

const SAME_LOOK: Choice = {
  id: 'same',
  name: 'Same look',
  description: "The skill's own look, where the hero has been drawn in it; classic otherwise.",
};

function lookPicker(id: string, label: string, looks: readonly LookId[], current: LookId): Picker {
  return { id, label, choices: looks.map((look) => LOOKS[look]), current };
}

/** The pick of `picker` as a look, if it is one. */
function picked(picks: Picks, picker: string): LookId | undefined {
  const value = picks[picker];
  return isLookId(value) ? value : undefined;
}

/** The looks `picks` choose for each piece, by the picker that chooses it; pieces without a pick keep the default. */
function pickedLooks<K extends string>(
  picks: Picks,
  pieces: readonly (readonly [piece: K, picker: string])[],
): Partial<Record<K, LookId>> {
  const looks: Partial<Record<K, LookId>> = {};
  for (const [piece, picker] of pieces) {
    const look = picked(picks, picker);
    if (look) looks[piece] = look;
  }
  return looks;
}

/** `look` for `piece`, or nothing, leaving the piece at the default. */
function lookFor<K extends string>(piece: K, look: LookId | undefined): Partial<Record<K, LookId>> {
  const looks: Partial<Record<K, LookId>> = {};
  if (look) looks[piece] = look;
  return looks;
}

/** A showcase demo's loop, which the scrubber follows round: the showcase counts its steps, so this is exact. */
function demoTimeline(params: ShowcaseParams): Timeline {
  return { frames: Math.round(resolveShowcase(params).demo.seconds * STEP_HZ), loops: true, beats: [] };
}

/** A hero playing every move, in any look, with any look for its skills and the customer it fights. */
function heroSubject(hero: Character): Subject {
  return {
    id: `hero-${hero.id}`,
    label: hero.name,
    pickers: [
      lookPicker('look', 'Look', offer.characters[hero.id], DEFAULT_LOOKS.characters[hero.id]),
      ...hero.skills.map((skill) =>
        lookPicker(skill, skills[skill].name, offer.skills[skill], DEFAULT_LOOKS.skills[skill]),
      ),
      lookPicker('customer', 'Customer', offer.customer, DEFAULT_LOOKS.customer),
    ],
    timeline: demoTimeline({ demo: 'moves', hero: hero.id }),
    show: (picks) => ({
      spec: { scene: 'showcase', params: { demo: 'moves', hero: hero.id } },
      looks: {
        characters: pickedLooks(picks, [[hero.id, 'look']]),
        skills: pickedLooks(
          picks,
          hero.skills.map((skill) => [skill, skill] as const),
        ),
        customer: picked(picks, 'customer'),
      },
    }),
  };
}

/** A skill cast by its hero, in any look, the hero in the skill's look unless picked otherwise. */
function skillSubject(skill: SkillId, hero: Character): Subject {
  const heroLooks = offer.characters[hero.id];
  return {
    id: `skill-${skill}`,
    label: skills[skill].name,
    pickers: [
      lookPicker('look', 'Look', offer.skills[skill], DEFAULT_LOOKS.skills[skill]),
      { id: 'hero', label: hero.name, choices: [SAME_LOOK, ...heroLooks.map((look) => LOOKS[look])], current: 'same' },
      lookPicker('customer', 'Customer', offer.customer, DEFAULT_LOOKS.customer),
    ],
    timeline: demoTimeline({ demo: 'skill', skill }),
    show: (picks) => {
      const skillLook = picked(picks, 'look');
      const sameLook = skillLook && heroLooks.includes(skillLook) ? skillLook : undefined;
      const heroLook = picks.hero === undefined || picks.hero === SAME_LOOK.id ? sameLook : picked(picks, 'hero');
      return {
        spec: { scene: 'showcase', params: { demo: 'skill', skill } },
        looks: {
          characters: lookFor(hero.id, heroLook),
          skills: lookFor(skill, skillLook),
          customer: picked(picks, 'customer'),
        },
      };
    },
  };
}

/** Who the customer demo's customer faces: the showcase's default hero. */
const CUSTOMER_FOE: CharacterId = 'hackerman';

/** The Unhappy Customer through all of its moods, in any look, against Hackerman in any of his. */
const customerSubject: Subject = {
  id: 'customer',
  label: 'Unhappy customer',
  pickers: [
    lookPicker('look', 'Look', offer.customer, DEFAULT_LOOKS.customer),
    lookPicker('hero', 'Hackerman', offer.characters[CUSTOMER_FOE], DEFAULT_LOOKS.characters[CUSTOMER_FOE]),
  ],
  timeline: demoTimeline({ demo: 'customer', hero: CUSTOMER_FOE }),
  show: (picks) => ({
    spec: { scene: 'showcase', params: { demo: 'customer', hero: CUSTOMER_FOE } },
    looks: { customer: picked(picks, 'look'), characters: pickedLooks(picks, [[CUSTOMER_FOE, 'hero']]) },
  }),
};

export const characterBoard: Board = {
  id: 'characters',
  title: 'Characters',
  summary: 'Every look of every hero, playing the same moves.',
  rows: characters.map((hero) => ({ subject: heroSubject(hero), title: hero.name })),
  compares: 'look',
  shares: [],
};

export const skillBoard: Board = {
  id: 'skills',
  title: 'Skills',
  summary: 'Every look of every skill, cast by its hero in the same look where the hero has one.',
  rows: characters.flatMap((hero) =>
    hero.skills.map((skill, index) => ({
      subject: skillSubject(skill, hero),
      title: skills[skill].name,
      ...(index === 0 ? { group: hero.name } : {}),
    })),
  ),
  compares: 'look',
  shares: [],
};

export const customerBoard: Board = {
  id: 'customer',
  title: 'Customer',
  summary: 'Every look of the Unhappy Customer, through all of its moods.',
  rows: [{ subject: customerSubject }],
  compares: 'look',
  shares: [],
};
