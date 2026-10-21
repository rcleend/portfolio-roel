import type { ActiveSkill } from '../skills/Skill';

/** The combined rules every running skill imposes this step. */
export interface ActiveModifiers {
  readonly customerSpeed: number;
  readonly customersCalm: boolean;
  readonly decisiveHits: boolean;
  readonly playerShielded: boolean;
}

export const NEUTRAL_MODIFIERS: ActiveModifiers = {
  customerSpeed: 1,
  customersCalm: false,
  decisiveHits: false,
  playerShielded: false,
};

/** Multiplies speeds and ORs flags across all running skills. */
export function combineModifiers(skills: readonly ActiveSkill[]): ActiveModifiers {
  return skills.reduce<ActiveModifiers>(
    (combined, { modifiers }) => ({
      customerSpeed: combined.customerSpeed * (modifiers.customerSpeed ?? 1),
      customersCalm: combined.customersCalm || modifiers.customersCalm === true,
      decisiveHits: combined.decisiveHits || modifiers.decisiveHits === true,
      playerShielded: combined.playerShielded || modifiers.playerShielded === true,
    }),
    NEUTRAL_MODIFIERS,
  );
}
