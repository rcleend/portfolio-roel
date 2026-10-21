import { describe, expect, it } from 'vitest';
import { type Body, type CollisionWorld, moveBody } from '../../world/collision';
import { TileGrid } from '../../world/grid';
import { jumpEnvelope, MOVEMENT, type MoveIntent, PlatformerMotor } from './movement';

const DT = 1 / 60;
const IDLE: MoveIntent = { x: 0, jumpPressed: false, jumpHeld: false };

/** Ground on rows 12–14 (y ≥ 200) except a pit from column `pitFrom` on. */
function world(pitFrom = 99): CollisionWorld {
  const grid = new TileGrid(40, 15, 8);
  for (let col = 0; col < Math.min(40, pitFrom); col++) {
    for (let row = 12; row < 15; row++) grid.set(col, row, 'solid');
  }
  return { grid, surfaces: [], walls: [] };
}

class Rig {
  readonly body: Body = { x: 40, y: 172, w: 12, h: 28, vx: 0, vy: 0 };
  readonly motor = new PlatformerMotor();
  readonly world: CollisionWorld;
  jumps = 0;

  constructor(collision = world()) {
    this.world = collision;
    this.step(IDLE);
  }

  step(intent: MoveIntent): void {
    if (this.motor.step(this.body, intent, DT)) this.jumps++;
    this.motor.settle(moveBody(this.body, DT, this.world).grounded);
  }

  run(steps: number, intent: MoveIntent = IDLE): void {
    for (let i = 0; i < steps; i++) this.step(intent);
  }

  /** Highest point the feet reach during `steps`. */
  peak(steps: number, intent: (step: number) => MoveIntent): number {
    let top = this.body.y + this.body.h;
    for (let i = 0; i < steps; i++) {
      this.step(intent(i));
      top = Math.min(top, this.body.y + this.body.h);
    }
    return 200 - top;
  }
}

describe('PlatformerMotor', () => {
  it('accelerates to run speed and stops quickly', () => {
    const rig = new Rig();
    rig.run(12, { ...IDLE, x: 1 });
    expect(rig.body.vx).toBe(MOVEMENT.runSpeed);
    rig.run(6);
    expect(rig.body.vx).toBe(0);
  });

  it('jumps about four tiles when jump is held', () => {
    const rig = new Rig();
    const height = rig.peak(60, (i) => ({ x: 0, jumpPressed: i === 0, jumpHeld: true }));
    expect(height).toBeGreaterThan(64);
    expect(height).toBeLessThan(72);
  });

  it('hops lower when jump is tapped (variable jump height)', () => {
    const tapped = new Rig().peak(60, (i) => ({ x: 0, jumpPressed: i === 0, jumpHeld: i < 3 }));
    const held = new Rig().peak(60, (i) => ({ x: 0, jumpPressed: i === 0, jumpHeld: true }));
    expect(tapped).toBeLessThan(held / 2);
    expect(tapped).toBeGreaterThan(8);
  });

  it('still jumps shortly after running off a ledge (coyote time)', () => {
    const rig = new Rig(world(4));
    rig.body.x = 50;
    rig.run(1);
    // Walk right until the body leaves the ground, then wait just under the coyote window.
    while (rig.motor.grounded) rig.step({ ...IDLE, x: 1 });
    rig.run(4);
    rig.step({ x: 0, jumpPressed: true, jumpHeld: true });
    expect(rig.jumps).toBe(1);
  });

  it('does not jump once the coyote window has passed', () => {
    const rig = new Rig(world(4));
    rig.body.x = 50;
    rig.run(1);
    while (rig.motor.grounded) rig.step({ ...IDLE, x: 1 });
    rig.run(8);
    rig.step({ x: 0, jumpPressed: true, jumpHeld: true });
    expect(rig.jumps).toBe(0);
  });

  it('remembers a jump pressed just before landing (jump buffer)', () => {
    const rig = new Rig();
    rig.body.y = 150;
    rig.body.vy = 200;
    rig.motor.settle(false);
    rig.step({ x: 0, jumpPressed: true, jumpHeld: true });
    expect(rig.jumps).toBe(0);
    for (let i = 0; i < 6 && rig.jumps === 0; i++) rig.step({ x: 0, jumpPressed: false, jumpHeld: true });
    expect(rig.jumps).toBe(1);
  });

  it('forgets a jump pressed too early', () => {
    const rig = new Rig();
    rig.body.y = 60;
    rig.motor.settle(false);
    rig.step({ x: 0, jumpPressed: true, jumpHeld: false });
    rig.run(60);
    expect(rig.jumps).toBe(0);
  });

  it('caps the fall speed', () => {
    const rig = new Rig(world(0));
    rig.run(120);
    expect(rig.body.vy).toBe(MOVEMENT.maxFallSpeed);
  });
});

describe('jumpEnvelope', () => {
  it('matches the simulated jump and shrinks with height', () => {
    const envelope = jumpEnvelope(MOVEMENT, 28, 1);
    const simulated = new Rig().peak(60, (i) => ({ x: 0, jumpPressed: i === 0, jumpHeld: true }));
    expect(envelope.maxRise).toBeGreaterThanOrEqual(simulated - 1);
    expect(envelope.reach(0)).toBeGreaterThan(envelope.reach(48));
    expect(envelope.reach(envelope.maxRise + 1)).toBe(Number.NEGATIVE_INFINITY);
  });
});
