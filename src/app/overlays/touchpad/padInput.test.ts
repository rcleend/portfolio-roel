import { describe, expect, it } from 'vitest';
import { bindings } from '@/game/input/bindings';
import { PadPresses } from './PadPresses';
import { actionsForGamepadButton, padActionMap } from './padActions';
import { dpadDirections, hitsButton, hitsRect, padInsets } from './padGeometry';

describe('padActionMap', () => {
  it('presses what the matching gamepad button presses', () => {
    const map = padActionMap(bindings);
    expect(map.buttons.jump).toEqual(['jump', 'confirm']);
    expect(map.buttons.attack).toEqual(['attack']);
    expect(map.buttons.skill1).toEqual(['skill1']);
    expect(map.buttons.skill2).toEqual(['skill2', 'back']);
    expect(map.buttons.start).toEqual(['confirm', 'pause']);
    expect(map.directions.left).toEqual(['left']);
  });

  it('finds nothing for an unbound button', () => {
    expect(actionsForGamepadButton(bindings, 99)).toEqual([]);
  });
});

describe('dpadDirections', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };

  it('reads the four arms', () => {
    expect(dpadDirections(rect, 95, 50)).toEqual(['right']);
    expect(dpadDirections(rect, 50, 5)).toEqual(['up']);
    expect(dpadDirections(rect, 5, 50)).toEqual(['left']);
    expect(dpadDirections(rect, 50, 95)).toEqual(['down']);
  });

  it('presses two directions on a diagonal', () => {
    expect(dpadDirections(rect, 85, 15)).toEqual(['right', 'up']);
    expect(dpadDirections(rect, 15, 85).sort()).toEqual(['down', 'left']);
  });

  it('ignores the dead centre and touches far outside', () => {
    expect(dpadDirections(rect, 52, 48)).toEqual([]);
    expect(dpadDirections(rect, 200, 50)).toEqual([]);
  });

  it('forgives a thumb slightly off the edge', () => {
    expect(dpadDirections(rect, 110, 50)).toEqual(['right']);
  });
});

describe('hitsButton', () => {
  it('is round with a little slop', () => {
    const rect = { left: 0, top: 0, width: 40, height: 40 };
    expect(hitsButton(rect, 20, 20)).toBe(true);
    expect(hitsButton(rect, 44, 20)).toBe(true);
    expect(hitsButton(rect, 60, 20)).toBe(false);
  });
});

describe('hitsRect', () => {
  it('forgives a finger just below a slim capsule', () => {
    const rect = { left: 100, top: 100, width: 60, height: 24 };
    expect(hitsRect(rect, 130, 112)).toBe(true);
    expect(hitsRect(rect, 130, 135)).toBe(true);
    expect(hitsRect(rect, 130, 160)).toBe(false);
  });
});

describe('padInsets', () => {
  it('reserves a bottom band in portrait', () => {
    const clusters = [
      { left: 10, top: 600, width: 140, height: 140 },
      { left: 230, top: 580.4, width: 150, height: 160 },
    ];
    expect(padInsets('bottom', { width: 390, height: 844 }, clusters)).toEqual({
      top: 0,
      right: 0,
      bottom: 264,
      left: 0,
    });
  });

  it('reserves both flanks in landscape', () => {
    const clusters = [
      { left: 16, top: 200, width: 130, height: 130 },
      { left: 690, top: 180, width: 140, height: 160 },
    ];
    expect(padInsets('sides', { width: 844, height: 390 }, clusters)).toEqual({
      top: 0,
      right: 154,
      bottom: 0,
      left: 146,
    });
  });

  it('reserves nothing without clusters', () => {
    expect(padInsets('sides', { width: 1, height: 1 }, [])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('PadPresses', () => {
  function recorder() {
    const log: string[] = [];
    const presses = new PadPresses<string>({
      press: (action) => log.push(`+${action}`),
      release: (action) => log.push(`-${action}`),
    });
    return { log, presses };
  }

  it('turns finger changes into edges', () => {
    const { log, presses } = recorder();
    expect(presses.set(1, ['right'])).toEqual(['right']);
    presses.set(1, ['right', 'up']);
    presses.set(1, ['up']);
    presses.delete(1);
    expect(log).toEqual(['+right', '+up', '-right', '-up']);
  });

  it('keeps an action down while any finger holds it', () => {
    const { log, presses } = recorder();
    presses.set(1, ['confirm', 'jump']);
    presses.set(2, ['confirm', 'pause']);
    presses.delete(1);
    expect(log).toEqual(['+confirm', '+jump', '+pause', '-jump']);
    presses.clear();
    expect(log.slice(-2).sort()).toEqual(['-confirm', '-pause']);
  });
});
