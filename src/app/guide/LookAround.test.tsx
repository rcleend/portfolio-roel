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

  it('is always a button to the room, and shows itself seven seconds after the title first shows', () => {
    const scenes = director();
    const onLookAround = vi.fn();
    const button = render({ scenes, onLookAround });
    expect(button.getAttribute('aria-label')).toBe('Tired of the game? Look around the room');
    expect(button.dataset.shown).toBe('false');
    // The boot does not count.
    wait(LOOK_AROUND_HINT_DELAY_MS * 2);
    expect(button.dataset.shown).toBe('false');
    act(() => scenes.show('title'));
    wait(LOOK_AROUND_HINT_DELAY_MS - 100);
    expect(button.dataset.shown).toBe('false');
    wait(100);
    expect(button.dataset.shown).toBe('true');
    expect(button.textContent).toBe('Tired of the game?Look around!');
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

  it('times itself from the title it finds already showing, and counts the title once', () => {
    const scenes = director('title');
    const button = render({ scenes });
    wait(LOOK_AROUND_HINT_DELAY_MS / 2);
    act(() => scenes.show('characterSelect'));
    act(() => scenes.show('title'));
    wait(LOOK_AROUND_HINT_DELAY_MS / 2);
    expect(button.dataset.shown).toBe('true');
  });

  it('stays whenever the camera rests on the TV, levels included, and only its first showing plays the pictogram', () => {
    const scenes = director('title');
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
    act(() => scenes.show('level'));
    expect(show().dataset.shown).toBe('true');
    // Away in the room and back again: there at once, and quiet.
    atTv = false;
    expect(show().dataset.shown).toBe('false');
    atTv = true;
    expect(show().dataset.shown).toBe('true');
    expect(show().dataset.intro).toBe('false');
  });

  it('marks itself for touch screens', () => {
    const button = render({ scenes: director('title'), touch: true });
    expect(button.dataset.touch).toBe('true');
  });
});
