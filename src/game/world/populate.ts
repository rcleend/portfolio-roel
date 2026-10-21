import { Customer } from '../entities/customer/Customer';
import { REGULAR_CUSTOMER } from '../entities/customer/tuning';
import { Barrier } from '../entities/stage/Barrier';
import { Checkpoint } from '../entities/stage/Checkpoint';
import { HighlightBlock } from '../entities/stage/HighlightBlock';
import { MovingPlatform } from '../entities/stage/MovingPlatform';
import { RateLimitGate } from '../entities/stage/RateLimitGate';
import { SlowZone } from '../entities/stage/SlowZone';
import { TILE } from './grid';
import { GRID_ORIGIN_Y, GROUND_Y } from './map/buildGrid';
import type { StageDefinition } from './stage';

/** The size of a prop image frame; `PropSheet` satisfies this, and tests can pass plain objects. */
export interface PropSize {
  readonly width: number;
  readonly height: number;
}

export type StageProps = Readonly<Record<string, PropSize>>;

/** Every entity a stage starts with, placed from its layout markers and dressed by its theme. */
export interface StageEntities {
  readonly blocks: HighlightBlock[];
  readonly customers: Customer[];
  readonly movers: MovingPlatform[];
  readonly gates: RateLimitGate[];
  readonly slowZones: SlowZone[];
  readonly barriers: Barrier[];
  readonly checkpoints: Checkpoint[];
}

const rowTop = (row: number): number => GRID_ORIGIN_Y + row * TILE;
const tileCenter = (col: number): number => col * TILE + TILE / 2;

/**
 * Turns layout markers into entities. Highlight ids are handed out to the
 * "?" blocks left to right, in the order the experience lists them.
 */
export function populateStage(
  stage: StageDefinition,
  props: StageProps,
  highlightIds: readonly string[],
): StageEntities {
  const { layout, theme } = stage;
  const prop = (name: string): PropSize => {
    const size = props[name];
    if (!size) throw new Error(`Stage ${stage.levelId}: the art has no "${name}" prop`);
    return size;
  };

  const blocks = layout.blocks.map((cell, index) => {
    const id = highlightIds[index];
    if (id === undefined) throw new Error(`Stage ${stage.levelId}: no highlight for block ${index + 1}`);
    return new HighlightBlock(cell.col, cell.row, rowTop(cell.row), id);
  });

  const mover = prop(theme.mover.prop);
  const movers = layout.movers.map(
    (run) => new MovingPlatform(theme.mover, mover.width, mover.height, run.from * TILE, (run.to + 1) * TILE, GROUND_Y),
  );

  const gateStyle = theme.gate;
  const gates = gateStyle
    ? layout.gates.map((cell) => {
        const size = prop(gateStyle.prop);
        return new RateLimitGate(gateStyle, tileCenter(cell.col), GROUND_Y, size.width, size.height);
      })
    : [];

  const zoneStyle = theme.slowZone;
  const slowZones = zoneStyle
    ? layout.slowZones.map((run) => {
        const height = prop(zoneStyle.prop).height;
        const rect = { x: run.from * TILE, y: GROUND_Y - height, w: (run.to - run.from + 1) * TILE, h: height };
        return new SlowZone(rect, { speed: zoneStyle.speed, jump: zoneStyle.jump });
      })
    : [];

  const barrierStyle = theme.barrier;
  const barriers = barrierStyle
    ? layout.barriers.map((cell) => {
        const size = prop(barrierStyle.prop);
        return new Barrier(cell.col * TILE, GROUND_Y, size.width, size.height, barrierStyle.topInset);
      })
    : [];

  return {
    blocks,
    customers: layout.customers.map(
      (cell) => new Customer(REGULAR_CUSTOMER, tileCenter(cell.col), rowTop(cell.row + 1)),
    ),
    movers,
    gates,
    slowZones,
    barriers,
    checkpoints: layout.checkpoints.map((cell) => new Checkpoint(tileCenter(cell.col), GROUND_Y)),
  };
}
