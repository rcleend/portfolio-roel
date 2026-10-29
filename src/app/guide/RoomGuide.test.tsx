// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LitProp, Room, RoomTarget } from '@/room';
import { watchInputModality } from '../a11y/inputModality';
import type { SceneSignal } from '../hosts/types';
import { loadGuideProgress, saveGuideProgress } from './guideProgress';
import { RoomGuide } from './RoomGuide';

watchInputModality();

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
      root.render(
        <RoomGuide
          room={stubRoom()}
          view="room"
          settled={true}
          scenes={scenes}
          handOver={{ current: false }}
          onFocusStage={() => {}}
        />,
      ),
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

describe('the overview menu', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    // The tour has played on an earlier visit: the menu alone lights the props.
    saveGuideProgress(window.localStorage, {
      lookedAround: true,
      visitedComputer: false,
      leftComputer: false,
      toured: true,
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root.render(
        <RoomGuide
          room={stubRoom()}
          view="room"
          settled={true}
          scenes={scenes}
          handOver={{ current: false }}
          onFocusStage={() => {}}
        />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const item = (target: RoomTarget): HTMLButtonElement =>
    host.querySelector(`.overview__item[data-target="${target}"]`) as HTMLButtonElement;
  const lit = (): string | null =>
    host.querySelector('.overview__item[data-lit="true"]')?.getAttribute('data-target') ?? null;
  const byKey = (): void =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });
  const pointerOver = (button: HTMLButtonElement): void =>
    act(() => {
      button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    });
  const pointerOut = (button: HTMLButtonElement): void =>
    act(() => {
      button.dispatchEvent(
        new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }),
      );
    });

  it('lights the item under the pointer, and the one the keyboard has once the pointer leaves', () => {
    byKey();
    act(() => item('pc').focus());
    expect(lit()).toBe('pc');

    pointerOver(item('tv'));
    expect(lit()).toBe('tv');
    pointerOut(item('tv'));
    expect(lit()).toBe('pc');
  });

  it('does not light an item a pointer only pressed', () => {
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' }));
    });
    act(() => item('pc').focus());
    expect(lit()).toBeNull();
  });
});
