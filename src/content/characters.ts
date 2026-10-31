import type { Character, CharacterId, Skill, SkillId } from './types';

/** The three playable sides of Roel, in select-screen order. */
export const characters: readonly Character[] = [
  {
    id: 'hackerman',
    name: 'HACKERMAN',
    className: 'ENGINEER',
    bio: 'Types faster than complaints can pile up. Fixes the bug before it lands, then ships the fix twice.',
    attack: 'Code bolts',
    skills: ['full-stack-attack', 'agent-summon'],
  },
  {
    id: 'artsy',
    name: 'ARTSY',
    className: 'DESIGNER',
    bio: 'Sees the button before it exists. Turns tangled screens into ones that feel obvious, then plays a riff.',
    attack: 'Music notes',
    skills: ['ux-elixir', 'power-chord'],
  },
  {
    id: 'strategy',
    name: 'STRATEGY',
    className: 'STRATEGIST',
    bio: 'Asks the customer first, swings second. Turns every grumble into a plan and every plan into a win.',
    attack: 'Sticky notes',
    skills: ['north-star', 'churn-shield'],
  },
];

/**
 * Each skill's `tooltip` is the select screen's line about it: what the skill is in Roel's real work, as the résumé
 * has it (round eight, item 46), never the game's own world. `effect` is what it does in a level (the pause menu).
 */
export const skills: Readonly<Record<SkillId, Skill>> = {
  'full-stack-attack': {
    id: 'full-stack-attack',
    name: 'FULL-STACK ATTACK',
    tooltip: 'Builds whole products alone, web and mobile, from database to button.',
    effect: 'A three-layer beam that pierces every unhappy customer in a line.',
    cooldownSeconds: 6,
  },
  'agent-summon': {
    id: 'agent-summon',
    name: 'AGENT SUMMON',
    tooltip: 'Designs and builds real AI agents, from the chat box to the tool calls.',
    effect: 'An AI drone orbits you for 8 seconds, firing at the nearest unhappy customer.',
    cooldownSeconds: 12,
  },
  'ux-elixir': {
    id: 'ux-elixir',
    name: 'UX ELIXIR',
    tooltip: 'Brews interfaces that feel obvious, stirred with real user research.',
    effect: 'For 6 seconds, unhappy customers calm down, slow down and are won over in one hit.',
    cooldownSeconds: 12,
  },
  'power-chord': {
    id: 'power-chord',
    name: 'POWER CHORD',
    tooltip: 'Studied guitar at the conservatory, and still writes his own songs.',
    effect: 'A screen-wide shockwave that stuns every unhappy customer for 3 seconds.',
    cooldownSeconds: 10,
  },
  'north-star': {
    id: 'north-star',
    name: 'NORTH STAR',
    tooltip: 'Finds the one goal a product should chase, and gets the team chasing it.',
    effect: 'A homing star that seeks out the most frustrated customer on screen.',
    cooldownSeconds: 7,
  },
  'churn-shield': {
    id: 'churn-shield',
    name: 'CHURN SHIELD',
    tooltip: 'Fixes onboarding until new users turn into regulars who stay.',
    effect: 'Blocks all damage for 5 seconds. Customers who bump into it calm down.',
    cooldownSeconds: 14,
  },
};

export function getCharacter(id: CharacterId): Character {
  const character = characters.find((entry) => entry.id === id);
  if (!character) throw new Error(`Unknown character: ${id}`);
  return character;
}
