import { describe, expect, it, vi } from 'vitest';
import type { GameSurface } from '@/engine/core/GameSurface';
import { ViewController } from './ViewController';
import type { RoomView } from './viewState';

function fakeSurface() {
  let paused = false;
  const surface = {
    canvas: {} as HTMLCanvasElement,
    width: 320,
    height: 240,
    onFrame: () => () => {},
    pause: vi.fn(() => {
      paused = true;
    }),
    resume: vi.fn(() => {
      paused = false;
    }),
    get paused() {
      return paused;
    },
    setInputEnabled: vi.fn(),
    pointer: { move: vi.fn(), leave: vi.fn(), down: vi.fn(), up: vi.fn() },
  } satisfies GameSurface;
  return surface;
}

function setup() {
  const surface = fakeSurface();
  const arrivals: (() => void)[] = [];
  const releasePointer = vi.fn();
  const views = new ViewController({
    surface,
    moveCamera: (_view: RoomView, arrived) => arrivals.push(arrived),
    releasePointer,
  });
  const land = () => arrivals.shift()?.();
  return { surface, views, land, releasePointer };
}

describe('ViewController', () => {
  it('enables game input on creation, settled on the TV', () => {
    const { surface, views } = setup();
    expect(surface.setInputEnabled).toHaveBeenLastCalledWith(true);
    expect(views.atTv).toBe(true);
  });

  it('pauses the game and releases its pointer when leaving the TV', () => {
    const { surface, views, releasePointer } = setup();
    const listener = vi.fn();
    views.onChange(listener);
    views.request('room');
    expect(surface.paused).toBe(true);
    expect(surface.setInputEnabled).toHaveBeenLastCalledWith(false);
    expect(releasePointer).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith('room');
    expect(views.atTv).toBe(false);
  });

  it('resumes only after the camera lands back on the TV', () => {
    const { surface, views, land } = setup();
    views.request('room');
    land();
    views.request('tv');
    expect(surface.paused).toBe(true);
    land();
    expect(surface.paused).toBe(false);
    expect(surface.setInputEnabled).toHaveBeenLastCalledWith(true);
  });

  it('leaves a game the app paused itself paused', () => {
    const { surface, views, land } = setup();
    surface.pause();
    views.request('room');
    land();
    views.request('tv');
    land();
    expect(surface.resume).not.toHaveBeenCalled();
    expect(surface.paused).toBe(true);
  });
});
