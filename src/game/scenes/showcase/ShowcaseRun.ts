import { type CharacterId, getLevel, type LevelId } from '@/content';
import { Rng } from '@/engine/math/Rng';
import type { BubbleText } from '../../entities/complaints/SpeechBubble';
import type { WorldEvent } from '../../world/events';
import type { StageProps } from '../../world/populate';
import { World } from '../../world/World';
import { arenaStage } from './arena';
import type { ShowcaseDemo } from './demos';
import { ScriptedInput } from './script';

export interface ShowcaseSetup {
  readonly levelId: LevelId;
  readonly hero: CharacterId;
  readonly demo: ShowcaseDemo;
  readonly props: StageProps;
  readonly layoutBubble: (text: string) => BubbleText;
  /** Every loop replays this random stream, so frame N always looks the same. */
  readonly seed: number;
  readonly reducedMotion: boolean;
}

const DT = 1 / 60;

/**
 * The showcase's loop: a real `World` on a one-screen arena, played by the
 * demo's script, and replaced by a fresh one with the same seed every
 * `demo.seconds`. The loop is exactly periodic: step N and step N plus a
 * loop show the same frame.
 */
export class ShowcaseRun {
  readonly #setup: ShowcaseSetup;
  readonly #loopSteps: number;
  #world: World;
  #script: ScriptedInput;
  #step = 0;

  constructor(setup: ShowcaseSetup) {
    this.#setup = setup;
    this.#loopSteps = Math.round(setup.demo.seconds / DT);
    this.#world = this.#createWorld();
    this.#script = new ScriptedInput(setup.demo.beats);
  }

  get world(): World {
    return this.#world;
  }

  /** Steps into the current loop; 0 right after it started over. */
  get step(): number {
    return this.#step;
  }

  /** Seconds into the current loop. */
  get time(): number {
    return this.#step * DT;
  }

  /** Advances one fixed step (or starts the loop over) and returns what happened in the world. */
  advance(): readonly WorldEvent[] {
    this.#step++;
    if (this.#step >= this.#loopSteps) {
      this.#step = 0;
      this.#world = this.#createWorld();
      this.#script = new ScriptedInput(this.#setup.demo.beats);
      return [];
    }
    this.#world.step(this.#script.step(this.#world, this.#step), DT);
    return this.#world.drainEvents();
  }

  #createWorld(): World {
    const { levelId, hero, demo, props, layoutBubble, seed, reducedMotion } = this.#setup;
    return new World({
      stage: arenaStage(levelId, demo.customers),
      props,
      characterId: hero,
      highlightIds: [],
      complaints: getLevel(levelId).complaints,
      layoutBubble,
      rng: new Rng(seed),
      reducedMotion,
      screen: { width: 320, height: 240 },
    });
  }
}
