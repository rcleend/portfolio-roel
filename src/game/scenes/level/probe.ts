import type { GameCursor } from '@/engine/core/GameSurface';
import type { ButtonState } from '../../ui/Button';
import type { ControlDevice } from '../../ui/hud/keyLabels';
import type { World } from '../../world/World';
import type { ControlHints, HintAction } from './overlays/controlHints';

/**
 * What the level shows, as plain data, for end-to-end tests that play it the way a visitor would: they look here
 * where a visitor looks at the screen, and act only through the page's mouse and keys. Development builds only
 * (`LevelScene.probe`).
 */
export interface LevelProbe {
  readonly phase: string;
  readonly view: { readonly x: number; readonly y: number };
  readonly player: {
    readonly x: number;
    readonly feet: number;
    readonly facing: -1 | 1;
    readonly grounded: boolean;
    readonly hearts: number;
  };
  /** Shots fired so far, and those in flight with their heading. */
  readonly fired: number;
  readonly shots: readonly { readonly x: number; readonly vx: number }[];
  readonly walking: boolean;
  readonly cursor: GameCursor;
  readonly highlights: number;
  readonly blocks: readonly { readonly x: number; readonly y: number; readonly used: boolean }[];
  readonly customers: readonly {
    readonly x: number;
    readonly y: number;
    readonly feet: number;
    readonly unhappy: boolean;
    readonly escalated: boolean;
  }[];
  /** The strip's keys left to right along its middle row: where each one is, and how it looks. */
  readonly strip: readonly {
    readonly action: HintAction;
    readonly from: number;
    readonly to: number;
    readonly state: ButtonState;
  }[];
}

export interface ProbeSources {
  readonly world: World;
  readonly phase: string;
  readonly walking: boolean;
  readonly cursor: GameCursor;
  readonly hints: ControlHints;
  readonly device: ControlDevice;
}

/** The strip's middle row, where the probe sweeps for its keys. */
const STRIP_ROW = 230;

export function levelProbe({ world, phase, walking, cursor, hints, device }: ProbeSources): LevelProbe {
  const { player } = world;
  const strip: { action: HintAction; from: number; to: number; state: ButtonState }[] = [];
  for (let x = 0; x < 320; x++) {
    const action = hints.hitTest(x, STRIP_ROW, device);
    const last = strip.at(-1);
    if (action && last?.action === action) last.to = x;
    else if (action) strip.push({ action, from: x, to: x, state: hints.state(action) });
  }
  return {
    strip,
    phase,
    view: { ...world.camera.view },
    player: {
      x: player.centerX,
      feet: player.feet,
      facing: player.facing,
      grounded: player.grounded,
      hearts: player.hearts,
    },
    fired: world.loadout.fired,
    shots: world.shots.map((shot) => ({ x: shot.x, vx: shot.vx })),
    walking,
    cursor,
    highlights: world.highlights.length,
    blocks: world.blocks.map((block) => ({
      x: block.rect.x + block.rect.w / 2,
      y: block.rect.y + block.rect.h / 2,
      used: block.used,
    })),
    customers: world.customers.map((customer) => ({
      x: customer.centerX,
      y: customer.rect.y + customer.rect.h / 2,
      feet: customer.feet,
      unhappy: customer.active && !customer.won,
      escalated: customer.escalated,
    })),
  };
}
