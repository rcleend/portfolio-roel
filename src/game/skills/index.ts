import type { SkillId } from '@/content';
import { agentSummon } from './agentSummon';
import { churnShield } from './churnShield';
import { fullStackAttack } from './fullStackAttack';
import { northStar } from './northStar';
import { powerChord } from './powerChord';
import type { Skill } from './Skill';
import { uxElixir } from './uxElixir';

/** Every skill's behaviour, by the content's `SkillId`. */
export const SKILLS: Readonly<Record<SkillId, Skill>> = {
  'full-stack-attack': fullStackAttack,
  'agent-summon': agentSummon,
  'ux-elixir': uxElixir,
  'power-chord': powerChord,
  'north-star': northStar,
  'churn-shield': churnShield,
};

export type { ActiveSkill, Skill, SkillCaster, SkillModifiers, SkillTarget, SkillWorld } from './Skill';
export { SkillSlot } from './SkillSlot';
