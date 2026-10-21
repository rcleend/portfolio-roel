import type { ActiveSkill, Skill, SkillWorld } from './Skill';

/** One of the player's two skill buttons: a skill plus its cooldown. */
export class SkillSlot {
  readonly skill: Skill;
  readonly cooldown: number;
  #remaining = 0;

  constructor(skill: Skill, cooldownSeconds: number) {
    if (!(cooldownSeconds >= 0)) throw new RangeError(`SkillSlot: cooldown must be >= 0, got ${cooldownSeconds}`);
    this.skill = skill;
    this.cooldown = cooldownSeconds;
  }

  get ready(): boolean {
    return this.#remaining <= 0;
  }

  /** Seconds until the skill can be cast again. */
  get remaining(): number {
    return Math.max(0, this.#remaining);
  }

  /** 0 right after casting, rising to 1 when ready — drives the HUD's cooldown sweep. */
  get charge(): number {
    return this.cooldown === 0 ? 1 : 1 - this.remaining / this.cooldown;
  }

  update(dt: number): void {
    this.#remaining = Math.max(0, this.#remaining - dt);
  }

  /** Casts if ready and starts the cooldown; returns the running skill, or null while cooling down. */
  tryCast(world: SkillWorld): ActiveSkill | null {
    if (!this.ready) return null;
    this.#remaining = this.cooldown;
    return this.skill.cast(world);
  }
}
