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
  /** Every camera move and screen change, in order, as the controller performed them. */
  const log: string[] = [];
  const releasePointer = vi.fn();
  const views = new ViewController({
    surface,
    moveCamera: (from: RoomView, to: RoomView, arrived) => {
      log.push(`move ${from}→${to}`);
      arrivals.push(arrived);
    },
    releasePointer,
    revealScreen: () => log.push('reveal'),
    concealScreen: () => log.push('conceal'),
  });
  const land = () => arrivals.shift()?.();
  return { surface, views, land, releasePointer, log };
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

  it('tells settle listeners once the camera lands, never as it sets off', () => {
    const { views, land } = setup();
    const settled = vi.fn();
    views.onSettle(settled);
    views.request('pc');
    expect(settled).not.toHaveBeenCalled();
    land();
    expect(settled).toHaveBeenCalledExactlyOnceWith('pc');
    views.request('pc');
    expect(settled).toHaveBeenCalledTimes(1);
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

  it('retains ownership of the pause through visits to the computer', () => {
    const { surface, views, land } = setup();
    for (const view of ['room', 'pc', 'room'] satisfies RoomView[]) {
      views.request(view);
      land();
      expect(surface.paused).toBe(true);
      expect(surface.setInputEnabled).toHaveBeenLastCalledWith(false);
    }
    expect(surface.pause).toHaveBeenCalledTimes(1);
    views.request('tv');
    expect(surface.resume).not.toHaveBeenCalled();
    land();
    expect(surface.resume).toHaveBeenCalledTimes(1);
  });

  it('never resumes a game the app paused, however often the visitor uses the computer', () => {
    const { surface, views, land } = setup();
    surface.pause();
    for (const view of ['room', 'pc', 'room', 'pc', 'room', 'tv'] satisfies RoomView[]) {
      views.request(view);
      land();
    }
    expect(surface.resume).not.toHaveBeenCalled();
    expect(surface.paused).toBe(true);
    // The room's pause ownership is reset: a game resumed by the app is paused afresh next time.
    surface.resume();
    views.request('room');
    expect(surface.paused).toBe(true);
    views.request('tv');
    land();
    expect(surface.paused).toBe(false);
  });

  it('shows the screen on landing at the computer and hides it before the camera leaves', () => {
    const { views, land, log } = setup();
    views.request('room');
    land();
    views.request('pc');
    expect(log).toEqual(['move tv→room', 'move room→pc']);
    land();
    expect(log.at(-1)).toBe('reveal');
    views.request('room');
    expect(log.slice(-2)).toEqual(['conceal', 'move pc→room']);
    land();
    views.request('pc');
    land();
    views.request('tv');
    expect(log.slice(-2)).toEqual(['conceal', 'move pc→tv']);
  });

  it('hides the screen and never shows it when leaving during the flight in', () => {
    const { views, land, log } = setup();
    views.request('room');
    land();
    views.request('pc');
    views.request('room');
    land();
    land();
    expect(log).toEqual(['move tv→room', 'move room→pc', 'conceal', 'move pc→room']);
  });
});
