import { describe, expect, it } from 'vitest';
import type { GameSurface } from '@/engine/core/GameSurface';
import { FocusGatedSurface } from './FocusGatedSurface';

function fakeSurface(): GameSurface & { inputEnabled: boolean | null; pauses: number } {
  const surface = {
    canvas: {} as HTMLCanvasElement,
    width: 320,
    height: 240,
    paused: false,
    untouched: 0,
    inputEnabled: null as boolean | null,
    pauses: 0,
    onFrame: () => () => {},
    pause() {
      surface.paused = true;
      surface.pauses++;
    },
    resume() {
      surface.paused = false;
    },
    setInputEnabled(enabled: boolean) {
      surface.inputEnabled = enabled;
    },
    pointer: { move() {}, leave() {}, down() {}, up() {} },
    cursor: 'hand' as const,
    onCursorChange: () => () => {},
  };
  return surface;
}

describe('FocusGatedSurface', () => {
  it('enables input only while the presenter wants it and the stage has focus', () => {
    const inner = fakeSurface();
    const gated = new FocusGatedSurface(inner);
    gated.setInputEnabled(true);
    expect(inner.inputEnabled).toBe(false);
    gated.setFocused(true);
    expect(inner.inputEnabled).toBe(true);
    gated.setInputEnabled(false);
    expect(inner.inputEnabled).toBe(false);
    gated.setInputEnabled(true);
    gated.setFocused(false);
    expect(inner.inputEnabled).toBe(false);
  });

  it('passes everything else straight through', () => {
    const inner = fakeSurface();
    const gated = new FocusGatedSurface(inner);
    gated.pause();
    expect(gated.paused).toBe(true);
    expect(inner.pauses).toBe(1);
    gated.resume();
    expect(inner.paused).toBe(false);
    expect(gated.width).toBe(320);
    expect(gated.pointer).toBe(inner.pointer);
  });
});
