import type { Character, CharacterId, Skill, SkillId } from './types';

/** The three playable sides of Roel, in select-screen order. */
export const characters: readonly Character[] = [
  {
    id: 'hackerman',
    name: 'HACKERMAN',
    tag: 'ROEL',
    className: 'ENGINEER',
    bio:
      'Speaks fluent TypeScript. Ships end to end: React front-ends, NestJS back-ends, a native iOS app ' +
      '— and AI agents that actually call the right tools.',
    attack: 'Code bolts',
    skills: ['full-stack-attack', 'agent-summon'],
  },
  {
    id: 'artsy',
    name: 'ARTSY',
    tag: 'ROEL',
    className: 'DESIGNER',
    bio:
      'Sees the interface before it exists. Interaction Technology MSc by day, guitarist by night. ' +
      'Untangles messy flows until they feel obvious.',
    attack: 'Paint splats',
    skills: ['ux-elixir', 'power-chord'],
  },
  {
    id: 'strategy',
    name: 'STRATEGY',
    tag: 'ROEL',
    className: 'STRATEGIST',
    bio:
      'Talks to customers before writing a line of code. Turns fuzzy founder ideas into jobs-to-be-done, ' +
      'roadmaps and metrics that move.',
    attack: 'Sticky notes',
    skills: ['north-star', 'churn-shield'],
  },
];

export const skills: Readonly<Record<SkillId, Skill>> = {
  'full-stack-attack': {
    id: 'full-stack-attack',
    name: 'FULL-STACK ATTACK',
    tooltip:
      'Hurls the whole stack — front-end, back-end and database — in one piercing blast. ' +
      'Forged in Next.js, NestJS and React Native.',
    effect: 'A three-layer beam that pierces every unhappy customer in a line.',
    cooldownSeconds: 6,
  },
  'agent-summon': {
    id: 'agent-summon',
    name: 'AGENT SUMMON',
    tooltip:
      'Summons an AI sidekick that calls its own tools and hunts down nearby problems. ' +
      'Its real-life twins lift user retention by up to 30%.',
    effect: 'An AI drone orbits you for 8 seconds, firing at the nearest unhappy customer.',
    cooldownSeconds: 12,
  },
  'ux-elixir': {
    id: 'ux-elixir',
    name: 'UX ELIXIR',
    tooltip:
      'A drinkable potion that makes you deeply understand users and their behavioural patterns. ' +
      'Suddenly every complaint makes sense.',
    effect: 'For 6 seconds, unhappy customers calm down, slow down and are won over in one hit.',
    cooldownSeconds: 12,
  },
  'power-chord': {
    id: 'power-chord',
    name: 'POWER CHORD',
    tooltip:
      'One mighty strum on the white Strat. The shockwave stuns every unhappy customer in sight. ' +
      'Tuned at the Conservatorium van Amsterdam.',
    effect: 'A screen-wide shockwave that stuns every unhappy customer for 3 seconds.',
    cooldownSeconds: 10,
  },
  'north-star': {
    id: 'north-star',
    name: 'NORTH STAR',
    tooltip:
      'Launches a guiding star that homes in on the problem that matters most. ' +
      'Ignores every vanity metric along the way.',
    effect: 'A homing star that seeks out the most frustrated customer on screen.',
    cooldownSeconds: 7,
  },
  'churn-shield': {
    id: 'churn-shield',
    name: 'CHURN SHIELD',
    tooltip: 'A retention bubble no hit gets through. Field-tested in real life: it nearly halved monthly churn.',
    effect: 'Blocks all damage for 5 seconds. Customers who bump into it calm down.',
    cooldownSeconds: 14,
  },
};

export function getCharacter(id: CharacterId): Character {
  const character = characters.find((entry) => entry.id === id);
  if (!character) throw new Error(`Unknown character: ${id}`);
  return character;
}
