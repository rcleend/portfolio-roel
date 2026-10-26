import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView } from '../viewState';
import { PcInteractable } from './PcInteractable';

function target(id: 'pc' | 'desk', view: RoomView) {
  const views = { view, request: vi.fn() };
  return { target: new PcInteractable(id, new Group(), views), views };
}

describe('PcInteractable', () => {
  it.each([
    // view, target, cursor, click requests
    ['tv', 'pc', 'zoom-out', 'room'],
    ['tv', 'desk', 'zoom-out', 'room'],
    ['room', 'pc', 'zoom-in', 'pc'],
    ['room', 'desk', 'zoom-in', 'pc'],
    ['pc', 'pc', 'default', null],
    ['pc', 'desk', 'zoom-out', 'room'],
  ] as const)('in the %s view, the %s shows %s and a click requests %s', (view, id, cursor, request) => {
    const { target: interactable, views } = target(id, view);
    expect(interactable.cursor()).toBe(cursor);
    interactable.activate();
    if (request) expect(views.request).toHaveBeenCalledExactlyOnceWith(request);
    else expect(views.request).not.toHaveBeenCalled();
  });
});
