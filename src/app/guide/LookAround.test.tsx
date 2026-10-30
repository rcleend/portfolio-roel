// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneSignal } from '../hosts/types';
import { LOOK_AROUND_HINT_DELAY_MS, LookAround, useLookAroundPopup } from './LookAround';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The game's scenes as the director reports them, switched by hand. */
function director(initial: string | null = 'boot'): SceneSignal & { show(id: string): void } {
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

interface HarnessProps {
  readonly scenes: SceneSignal;
  readonly onLookAround?: () => void;
  readonly atTv?: boolean;
  readonly touch?: boolean;
  readonly handOver?: { current: boolean };
}

/** The popup as the guide keeps it: its state outlives the button, which shows only in the TV view. */
function Harness({ scenes, onLookAround = () => {}, atTv = true, touch = false, handOver }: HarnessProps) {
  const popup = useLookAroundPopup(scenes, atTv);
  const [noHandOver] = useState(() => ({ current: false }));
  return (
    <LookAround
      onLookAround={onLookAround}
      shown={popup.shown}
      intro={popup.intro}
      touch={touch}
      handOver={handOver ?? noHandOver}
    />
  );
}

describe("the TV view's way out", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  let mounts = 0;
  /** Mounts a fresh popup (a new key each time, so no state carries over). */
  const render = (props: HarnessProps): HTMLButtonElement => {
    mounts++;
    act(() => root.render(<Harness key={mounts} {...props} />));
    return host.querySelector('button') as HTMLButtonElement;
  };
  const wait = (ms: number): void =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it('is always a button to the room, and shows itself five seconds after the first level starts', () => {
    const scenes = director();
    const onLookAround = vi.fn();
    const button = render({ scenes, onLookAround });
    expect(button.getAttribute('aria-label')).toBe('Tired of playing? Look around the room');
    expect(button.dataset.shown).toBe('false');
    // The boot, the title and the select screens do not count.
    for (const scene of ['title', 'characterSelect', 'levelSelect']) {
      act(() => scenes.show(scene));
      wait(LOOK_AROUND_HINT_DELAY_MS * 2);
      expect(button.dataset.shown).toBe('false');
    }
    act(() => scenes.show('level'));
    wait(LOOK_AROUND_HINT_DELAY_MS - 100);
    expect(button.dataset.shown).toBe('false');
    wait(100);
    expect(button.dataset.shown).toBe('true');
    expect(button.textContent).toBe('Tired of playing?Click outside the TV to explore');
    act(() => button.click());
    expect(onLookAround).toHaveBeenCalledOnce();
  });

  // The host's own way out (RoomHost.tsx) goes as this takes its place: a keyboard standing on it comes along.
  it('takes the keyboard from the way out it replaces, and only once', () => {
    const handOver = { current: true };
    const button = render({ scenes: director(), handOver });
    expect(document.activeElement).toBe(button);
    expect(handOver.current).toBe(false);

    document.body.focus();
    const next = render({ scenes: director(), handOver });
    expect(document.activeElement).not.toBe(next);
  });

  it('times itself from the level it finds already showing, and counts the first level start only', () => {
    const scenes = director('level');
    const button = render({ scenes });
    wait(LOOK_AROUND_HINT_DELAY_MS / 2);
    act(() => scenes.show('stageClear'));
    act(() => scenes.show('level'));
    wait(LOOK_AROUND_HINT_DELAY_MS / 2);
    expect(button.dataset.shown).toBe('true');
  });

  it('stays whenever the camera rests on the TV, menus included, and only its first showing plays the pictogram', () => {
    const scenes = director('level');
    let atTv = true;
    const show = (): HTMLButtonElement => {
      act(() => root.render(<Harness key={mounts} atTv={atTv} scenes={scenes} />));
      return host.querySelector('button') as HTMLButtonElement;
    };
    mounts++;
    show();
    wait(LOOK_AROUND_HINT_DELAY_MS);
    expect(show().dataset.shown).toBe('true');
    expect(show().dataset.intro).toBe('true');
    act(() => scenes.show('title'));
    expect(show().dataset.shown).toBe('true');
    // Away in the room and back again: there at once, and quiet.
    atTv = false;
    expect(show().dataset.shown).toBe('false');
    atTv = true;
    expect(show().dataset.shown).toBe('true');
    expect(show().dataset.intro).toBe('false');
  });

  it('is the way out itself on a touch screen', () => {
    const button = render({ scenes: director('level'), touch: true });
    expect(button.textContent).toContain('Tap here to explore the room');
    expect(button.dataset.touch).toBe('true');
  });
});
