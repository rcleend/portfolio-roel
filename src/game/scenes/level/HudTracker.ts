import { approach } from '@/engine/math/scalar';
import { MAX_HEARTS } from '../../entities/player/Player';
import type { BossBarState } from '../../ui/hud/BossBar';
import type { HudState } from '../../ui/hud/Hud';
import { keyCapFor } from '../../ui/hud/keyLabels';
import type { World } from '../../world/World';

const NEVER = Number.NEGATIVE_INFINITY;
/** How fast the boss bar's white damage trail drains towards the real value, fraction per second. */
const TRAIL_DRAIN = 0.5;

/**
 * Remembers the moments the HUD animates around — a heart lost, MRR gained,
 * a skill ready again, the boss bar's trailing damage — and turns the world
 * into the plain state the HUD widgets draw.
 */
export class HudTracker {
  #hurtAt = NEVER;
  #scoredAt = NEVER;
  #lastHearts = MAX_HEARTS;
  #slotReadyAt: [number, number] = [NEVER, NEVER];
  #slotWasReady: [boolean, boolean] = [true, true];
  #bossBarAt: number | null = null;
  #bossTrail = 1;

  scored(time: number): void {
    this.#scoredAt = time;
  }

  bossArrived(time: number): void {
    this.#bossBarAt = time;
  }

  update(world: World, time: number, dt: number): void {
    if (world.player.hearts < this.#lastHearts) this.#hurtAt = time;
    this.#lastHearts = world.player.hearts;
    world.slots.forEach((slot, index) => {
      if (slot.ready && !this.#slotWasReady[index]) this.#slotReadyAt[index] = time;
      this.#slotWasReady[index] = slot.ready;
    });
    const boss = world.boss;
    // The white trail lingers, then drains towards the real value, so every hit visibly bites.
    if (boss) this.#bossTrail = approach(this.#bossTrail, boss.frustration / boss.tuning.frustration, dt * TRAIL_DRAIN);
  }

  hud(world: World, time: number, device: 'keyboard' | 'gamepad'): HudState {
    return {
      characterId: world.player.characterId,
      hearts: world.player.hearts,
      maxHearts: MAX_HEARTS,
      slots: world.slots.map((slot, index) => ({
        skillId: slot.skill.id,
        charge: slot.charge,
        remaining: slot.remaining,
        readyFor: time - (this.#slotReadyAt[index] ?? NEVER),
        key: keyCapFor(index === 0 ? 'skill1' : 'skill2', device),
      })),
      score: world.score,
      highlights: { collected: world.highlights.length, total: world.blocks.length },
      time,
      hurtFor: time - this.#hurtAt,
      scoredFor: time - this.#scoredAt,
    };
  }

  /** The boss bar, once the escalated customer has landed. */
  bossBar(world: World, time: number): BossBarState | null {
    const boss = world.boss;
    if (!boss || this.#bossBarAt === null) return null;
    return {
      label: `UNHAPPY CUSTOMER - ${world.stage.theme.bossPlan}`,
      fraction: boss.frustration / boss.tuning.frustration,
      trail: this.#bossTrail,
      age: time - this.#bossBarAt,
    };
  }
}
