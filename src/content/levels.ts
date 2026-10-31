import { emailLink } from './profile';
import type { LevelId, LevelInfo, LevelTeaser } from './types';

/** Playable missions, in chronological (and level-select) order. */
export const levels: readonly LevelInfo[] = [
  {
    id: 'luna',
    experienceId: 'luna',
    mission: 'MISSION 1',
    city: 'SAN FRANCISCO',
    country: 'USA',
    briefing:
      'A tiny AI startup is reinventing cold outbound and the inboxes are in revolt. Join the founding team, ' +
      'ship an AI agent and keep customers happy all the way to the acquisition.',
    target: 'FIND PRODUCT-MARKET FIT',
    complaints: ['MY EMAILS BOUNCED!', 'WHY AM I IN SPAM?', 'HOW DO I ADD INBOXES?', 'I NEED AN ASSISTANT!'],
  },
  {
    id: 'scripe',
    experienceId: 'scripe',
    mission: 'MISSION 2',
    city: 'BERLIN',
    country: 'GERMANY',
    briefing:
      'Berlin, the city that is never finished building. Founding product engineer at an AI startup: grow ARR, ' +
      'fix onboarding, ship an app and turn every complaint into a renewal.',
    target: 'FIND PRODUCT-MARKET FIT',
    complaints: ['MY POST GOT 3 LIKES!', "WHERE'S THE TEAM PLAN?", 'ONBOARDING IS CONFUSING!', 'IS THERE AN APP?!'],
  },
];

/** Locked slot after the last mission: the next chapter is the visitor's team. */
export const nextLevelTeaser: LevelTeaser = {
  mission: 'MISSION 3',
  title: 'YOUR TEAM?',
  body: 'The next level is still being designed. Looking for a team that raises the ceiling for craft.',
  cta: emailLink,
};

export function getLevel(id: LevelId): LevelInfo {
  const level = levels.find((entry) => entry.id === id);
  if (!level) throw new Error(`Unknown level: ${id}`);
  return level;
}
