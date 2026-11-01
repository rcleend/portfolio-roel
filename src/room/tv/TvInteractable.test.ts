import { Mesh, Object3D, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { GameSurface } from '@/engine/core/GameSurface';
import type { InteractionHit } from '../interaction/Interactable';
import { TvInteractable } from './TvInteractable';
import type { TvModel } from './tvModel';

function setUp(tapToBegin: boolean) {
  const root = new Object3D();
  const screen = new Mesh();
  const bezel = new Mesh();
  root.add(screen, bezel);
  const pointer = { move: vi.fn(), leave: vi.fn(), down: vi.fn(), up: vi.fn() };
  const surface = { width: 320, height: 240, pointer } as unknown as GameSurface;
  const tv = new TvInteractable({
    tv: { root, screen } as unknown as TvModel,
    surface,
    contentRect: { x: 0, y: 0, width: 1, height: 1 } as never,
    isPlayable: () => true,
    isInRoomView: () => false,
    focusTv: () => {},
    tapToBegin: () => tapToBegin,
  });
  const onBezel: InteractionHit = { object: bezel, point: new Vector3(), uv: null };
  return { tv, pointer, onBezel };
}

describe('the TV set under a finger', () => {
  it('presses the game anywhere on the set while the title waits for a tap', () => {
    const { tv, pointer, onBezel } = setUp(true);
    expect(tv.pointerDown(onBezel, 'touch')).toBe(true);
    expect(pointer.down).toHaveBeenCalledOnce();
    tv.pointerUp();
    expect(pointer.up).toHaveBeenCalledOnce();
  });

  it('leaves the bezel to itself for a mouse, and once the game is past its title', () => {
    const { tv, pointer, onBezel } = setUp(true);
    expect(tv.pointerDown(onBezel, 'mouse')).toBe(false);
    const later = setUp(false);
    expect(later.tv.pointerDown(later.onBezel, 'touch')).toBe(false);
    expect(pointer.down).not.toHaveBeenCalled();
    expect(later.pointer.down).not.toHaveBeenCalled();
  });
});
