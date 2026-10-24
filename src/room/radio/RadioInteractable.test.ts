import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Raycaster, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView } from '../viewState';
import type { DevicePick, DeviceTarget } from './deviceContract';
import { RadioInteractable } from './RadioInteractable';

const BODY = new Box3(new Vector3(0.735, 0.887, -2.205), new Vector3(1.295, 1.087, -1.865));

/** The cabinet mesh: a slab under the radio, as wide as the merged mesh (books on the left, the cable on the right). */
function cabinet(): Mesh {
  const mesh = new Mesh(new BoxGeometry(1.8, 0.88, 0.6), new MeshBasicMaterial());
  mesh.position.set(0.71, 0.44, -2.04);
  mesh.updateMatrixWorld();
  return mesh;
}

function setup(view: RoomView, pick: DevicePick | null = null) {
  const views = { view, moving: false, request: vi.fn() };
  const device = {
    pick: vi.fn(() => pick),
    pointerDown: vi.fn(() => true),
    pointerMove: vi.fn(),
    pointerUp: vi.fn(),
    activate: vi.fn(),
    hover: vi.fn(),
  };
  const deck = { available: true, prefetch: vi.fn(), prepared: device };
  const interactable = new RadioInteractable({
    root: new Object3D(),
    bodyBounds: BODY,
    cabinet: cabinet(),
    views,
    deck,
  });
  return { views, deck, interactable };
}

/** A ray from in front of the radio towards a point. */
function rayAt(target: Vector3): Raycaster {
  const origin = new Vector3(target.x, target.y + 0.4, -1.0);
  return new Raycaster(origin, target.clone().sub(origin).normalize(), 0.01, 20);
}

const RADIO = new Vector3(1.0, 1.0, -2.0);
const LAMP = new Vector3(0.49, 1.2, -1.97);
const CABINET = new Vector3(0.6, 0.6, -1.74);
const BOOKS = new Vector3(0.1, 0.4, -1.74);

describe('RadioInteractable', () => {
  it.each(['tv', 'pc'] as const)('answers nothing in the %s view: the room handles the miss', (view) => {
    const { interactable } = setup(view);
    for (const point of [RADIO, LAMP, CABINET]) expect(interactable.intersect(rayAt(point))).toBeNull();
  });

  it('flies to the radio from the radio, its lamp and its cabinet in the room view, and prefetches on hover', () => {
    const { interactable, views, deck } = setup('room');
    for (const point of [RADIO, LAMP, CABINET]) {
      const found = interactable.intersect(rayAt(point));
      if (!found) throw new Error('missed');
      expect(interactable.cursor(found.hit)).toBe('zoom-in');
      interactable.pointerMove(found.hit);
      interactable.activate(found.hit);
    }
    expect(views.request).toHaveBeenCalledTimes(3);
    expect(views.request).toHaveBeenLastCalledWith('radio');
    expect(deck.prefetch).toHaveBeenCalledWith('intent');
    expect(deck.prepared.pick).not.toHaveBeenCalled();
  });

  it('ignores the books and the cable merged into the cabinet mesh', () => {
    const { interactable } = setup('room');
    expect(interactable.intersect(rayAt(BOOKS))).toBeNull();
  });

  it('at the radio puts its parts first, uses the body and sends the surroundings back to the room', () => {
    const disc: DeviceTarget = { kind: 'disc', disc: 'a', seated: false };
    // A part further away than the body box (inside it) still wins.
    const pick = { target: disc, hit: { object: new Object3D(), point: RADIO.clone(), uv: null }, distance: 99 };
    const { interactable, views, deck } = setup('radio', pick);
    const part = interactable.intersect(rayAt(RADIO));
    if (!part) throw new Error('missed');
    expect(part.distance).toBe(99);
    expect(interactable.cursor(part.hit)).toBe('pointer');
    expect(interactable.pointerDown(part.hit)).toBe(true);
    expect(deck.prepared.pointerDown).toHaveBeenCalledWith(disc);
    interactable.pointerMove(null);
    expect(deck.prepared.pointerMove).toHaveBeenCalledWith(null);
    interactable.pointerUp();
    expect(deck.prepared.pointerUp).toHaveBeenCalled();

    deck.prepared.pick.mockReturnValue(null);
    const body = interactable.intersect(rayAt(RADIO));
    if (!body) throw new Error('missed');
    expect(interactable.cursor(body.hit)).toBe('default');
    expect(interactable.pointerDown(body.hit)).toBe(false);
    interactable.activate(body.hit);
    expect(views.request).not.toHaveBeenCalled();

    for (const point of [LAMP, CABINET]) {
      const around = interactable.intersect(rayAt(point));
      if (!around) throw new Error('missed');
      expect(interactable.cursor(around.hit)).toBe('zoom-out');
      interactable.activate(around.hit);
    }
    expect(views.request).toHaveBeenCalledWith('room');
  });

  it('hovers device parts at the radio and lets go when the pointer leaves', () => {
    const key: DeviceTarget = { kind: 'key', key: 'play-pause' };
    const pick = { target: key, hit: { object: new Object3D(), point: RADIO.clone(), uv: null }, distance: 1 };
    const { interactable, deck } = setup('radio', pick);
    const found = interactable.intersect(rayAt(RADIO));
    if (!found) throw new Error('missed');
    interactable.pointerMove(found.hit);
    expect(deck.prepared.hover).toHaveBeenLastCalledWith(key);
    interactable.pointerLeave();
    expect(deck.prepared.hover).toHaveBeenLastCalledWith(null);
  });

  it('is scenery once the radio cannot work', () => {
    for (const view of ['room', 'radio'] as const) {
      const { interactable, deck } = setup(view);
      deck.available = false;
      for (const point of [RADIO, LAMP, CABINET]) expect(interactable.intersect(rayAt(point))).toBeNull();
    }
  });
});
