import { type CharacterId, getCharacter, skills } from '@/content';
import { PRIMARY_ATTACKS, type PrimaryAttack } from '../entities/player/attacks';
import type { PlayerIntent } from '../entities/player/Player';
import { AttackShot } from '../entities/shots/AttackShot';
import type { Shot } from '../entities/shots/Shot';
import { SKILLS } from '../skills';
import type { ActiveSkill, SkillWorld } from '../skills/Skill';
import { SkillSlot } from '../skills/SkillSlot';

/** What the player's buttons triggered during one step. */
export interface LoadoutStep {
  readonly shot: Shot | null;
  readonly casts: readonly { readonly slot: SkillSlot; readonly running: ActiveSkill }[];
}

const NOTHING: LoadoutStep = { shot: null, casts: [] };

/**
 * A character's primary attack (fired while held, at its own rate) and two
 * skill slots with their content cooldowns.
 */
export class Loadout {
  readonly characterId: CharacterId;
  readonly attack: PrimaryAttack;
  readonly slots: readonly [SkillSlot, SkillSlot];
  #cooldown = 0;
  #fired = 0;

  constructor(characterId: CharacterId) {
    this.characterId = characterId;
    this.attack = PRIMARY_ATTACKS[characterId];
    const [first, second] = getCharacter(characterId).skills;
    this.slots = [
      new SkillSlot(SKILLS[first], skills[first].cooldownSeconds),
      new SkillSlot(SKILLS[second], skills[second].cooldownSeconds),
    ];
  }

  /**
   * Advances cooldowns and returns what `intent` triggers. `hand` is where
   * shots leave from; `canAct` is false while knocked back or after the
   * level is won.
   */
  step(
    intent: PlayerIntent,
    dt: number,
    canAct: boolean,
    hand: { readonly x: number; readonly y: number; readonly facing: -1 | 1 },
    world: SkillWorld,
  ): LoadoutStep {
    this.#cooldown = Math.max(0, this.#cooldown - dt);
    for (const slot of this.slots) slot.update(dt);
    if (!canAct) return NOTHING;

    let shot: Shot | null = null;
    if (intent.attackHeld && this.#cooldown === 0) {
      shot = new AttackShot(this.characterId, this.#fired++, this.attack, hand.x, hand.y, hand.facing);
      this.#cooldown = this.attack.cooldown;
    }
    const casts: { slot: SkillSlot; running: ActiveSkill }[] = [];
    this.slots.forEach((slot, index) => {
      if (!(index === 0 ? intent.skill1Pressed : intent.skill2Pressed)) return;
      const running = slot.tryCast(world);
      if (running) casts.push({ slot, running });
    });
    return { shot, casts };
  }
}
