// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LitProp, Room, RoomTarget } from '@/room';
import type { SceneSignal } from '../hosts/types';
import { loadGuideProgress } from './guideProgress';
import { RoomGuide } from './RoomGuide';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A room that only remembers which prop it was told to light, as the menu and the tour tell it. */
function stubRoom(): Room {
  const listeners = new Set<(lit: LitProp | null) => void>();
  let lit: LitProp | null = null;
  const spotlight = {
    light(target: RoomTarget | null) {
      lit = target ? { target, x: 0, y: 0 } : null;
      for (const listener of [...listeners]) listener(lit);
    },
    get lit() {
      return lit;
    },
    onChange(listener: (next: LitProp | null) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const radio = { available: true, prefetch() {}, onAvailableChange: () => () => {} };
  return { spotlight, radio, focusPc() {}, focusRadio() {}, focusTv() {}, showRoom() {} } as unknown as Room;
}

const scenes: SceneSignal = { current: 'title', onSceneChange: () => () => {} };

describe('the props’ tour', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  /** The camera rests in the room view on a first-ever visit: the tour is due. */
  const render = (): void => {
    act(() =>
      root.render(<RoomGuide room={stubRoom()} view="room" settled={true} scenes={scenes} onFocusStage={() => {}} />),
    );
  };
  const wait = (ms: number): void =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  const mouseAt = (x: number, y: number): void =>
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: x, clientY: y }));
    });
  /** Which menu item is in the light, i.e. which prop the room was told to light. */
  const inTheLight = (): string | null =>
    host.querySelector('.overview__item[data-lit="true"]')?.getAttribute('data-target') ?? null;
  const toured = (): boolean => loadGuideProgress(window.localStorage).toured;

  it('lights each prop in turn, then retires', () => {
    render();
    wait(450);
    expect(inTheLight()).toBe('pc');
    wait(750);
    expect(inTheLight()).toBe('radio');
    wait(750);
    expect(inTheLight()).toBe('tv');
    wait(750);
    expect(inTheLight()).toBeNull();
    expect(toured()).toBe(true);
  });

  // A visitor who arrives by keyboard has never moved the mouse here: the place the browser then re-sends for the
  // resting pointer is the tour's reference point, not the visitor exploring.
  it('plays on when the browser re-sends a resting pointer’s place', () => {
    render();
    mouseAt(100, 100);
    wait(450);
    expect(inTheLight()).toBe('pc');
    mouseAt(103, 102);
    expect(inTheLight()).toBe('pc');
    expect(toured()).toBe(false);
  });

  it('is cut short once the mouse really moves', () => {
    render();
    mouseAt(100, 100);
    wait(450);
    mouseAt(140, 100);
    expect(inTheLight()).toBeNull();
    expect(toured()).toBe(true);
  });
});
