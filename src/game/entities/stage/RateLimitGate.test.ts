import { describe, expect, it } from 'vitest';
import type { GateStyle } from '../../world/stage';
import { RateLimitGate } from './RateLimitGate';

const STYLE: GateStyle = { prop: 'gate', closedSeconds: 1, openSeconds: 2, beamColor: '#ff0000' };
const DT = 1 / 60;

function run(gate: RateLimitGate, seconds: number, occupants = [] as { x: number; y: number; w: number; h: number }[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) gate.update(DT, occupants);
}

describe('RateLimitGate', () => {
  it('cycles between closed (a wall) and open', () => {
    const gate = new RateLimitGate(STYLE, 0, 200, 24, 48);
    expect(gate.closed).toBe(true);
    expect(gate.wall).toEqual({ x: -6, y: 0, w: 12, h: 200 });
    run(gate, 1.05);
    expect(gate.closed).toBe(false);
    expect(gate.wall).toBeNull();
    run(gate, 2);
    expect(gate.closed).toBe(true);
  });

  it('never closes on someone standing in it', () => {
    const gate = new RateLimitGate(STYLE, 0, 200, 24, 48);
    run(gate, 1.05);
    const player = { x: -4, y: 172, w: 12, h: 28 };
    run(gate, 3, [player]);
    expect(gate.closed).toBe(false);
    run(gate, DT);
    expect(gate.closed).toBe(true);
  });
});
