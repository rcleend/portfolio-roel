import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView } from '../viewState';
import { SectionInteractable } from './SectionInteractable';

describe('section interaction', () => {
  it.each(['desk', 'drawer'] as const)('zooms into %s from the overview and out on a second click', (section) => {
    const views = { view: 'room' as RoomView, request: vi.fn() };
    const target = new SectionInteractable(section, new Group(), section, views);
    expect(target.cursor()).toBe('zoom-in');
    target.activate();
    expect(views.request).toHaveBeenLastCalledWith(section);
    views.view = section;
    expect(target.cursor()).toBe('zoom-out');
    target.activate();
    expect(views.request).toHaveBeenLastCalledWith('room');
  });

  it('preserves the outside-TV gesture and can move directly between sections', () => {
    const views = { view: 'tv' as RoomView, request: vi.fn() };
    const target = new SectionInteractable('desk', new Group(), 'desk', views);
    target.activate();
    expect(views.request).toHaveBeenLastCalledWith('room');
    views.view = 'drawer';
    target.activate();
    expect(views.request).toHaveBeenLastCalledWith('desk');
  });
});
