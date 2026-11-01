// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room, RoomView } from '@/room';
import type { SceneSignal } from '../hosts/types';
import { RoomGuide } from './RoomGuide';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The game's scenes as the director reports them, switched by hand. */
function director(initial: string | null): SceneSignal & { show(id: string): void } {
  const listeners = new Set<(id: string) => void>();
  let current = initial;
  return {
    get current() {
      return current;
    },
    onSceneChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show(id) {
      current = id;
      for (const listener of listeners) listener(id);
    },
  };
}

function stubRoom(showRoom: () => void): Room {
  const spotlight = { light() {}, lit: null, onChange: () => () => {} };
  const radio = { available: true, prefetch() {}, onAvailableChange: () => () => {} };
  return { spotlight, radio, focusPc() {}, focusRadio() {}, focusTv() {}, showRoom } as unknown as Room;
}

describe("the TV view's way out", () => {
  let host: HTMLDivElement;
  let root: Root;
  let showRoom: ReturnType<typeof vi.fn<() => void>>;
  let room: Room;

  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    showRoom = vi.fn<() => void>();
    room = stubRoom(showRoom);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  const render = (scenes: SceneSignal, view: RoomView, settled = true, handOver = { current: false }) => {
    act(() =>
      root.render(
        <RoomGuide
          room={room}
          view={view}
          settled={settled}
          scenes={scenes}
          handOver={handOver}
          onFocusStage={() => {}}
        />,
      ),
    );
    return host.querySelector<HTMLButtonElement>('.tv-way-out');
  };
  const wait = (ms: number): void =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it('says "Explore the room" and appears the moment the first press begins the game', () => {
    const button = render(director('title'), 'tv');
    expect(button?.getAttribute('aria-label')).toBe('Explore the room');
    expect(button?.textContent).toBe('Explore the room');
    expect(button?.dataset.shown).toBe('false');
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
    });
    expect(button?.dataset.shown).toBe('true');
    act(() => button?.click());
    expect(showRoom).toHaveBeenCalledOnce();
  });

  it('is there at once when the game has already left its title', () => {
    const scenes = director('boot');
    const button = render(scenes, 'tv');
    expect(button?.dataset.shown).toBe('false');
    act(() => scenes.show('characterSelect'));
    expect(button?.dataset.shown).toBe('true');
    expect(render(director('level'), 'tv')?.dataset.shown).toBe('true');
  });

  it('has no Escape key: that belongs to the game here', () => {
    const button = render(director('level'), 'tv');
    expect(button?.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(button?.querySelector('.back-button__key')).toBeNull();
    act(() => {
      button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(showRoom).not.toHaveBeenCalled();
  });

  it('says "Back to the room" once the visitor has been in the room, rising a beat after the camera lands', () => {
    const scenes = director('level');
    render(scenes, 'tv');
    expect(render(scenes, 'room')).toBeNull();
    let button = render(scenes, 'tv', false);
    expect(button?.getAttribute('aria-label')).toBe('Back to the room');
    expect(button?.dataset.shown).toBe('false');
    button = render(scenes, 'tv', true);
    expect(button?.dataset.shown).toBe('false');
    wait(450);
    expect(button?.dataset.shown).toBe('true');
  });

  it('takes the keyboard from the way out it replaces', () => {
    const handOver = { current: true };
    const button = render(director('title'), 'tv', true, handOver);
    expect(document.activeElement).toBe(button);
    expect(handOver.current).toBe(false);
  });
});
