// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneSignal } from '../hosts/types';
import { LOOK_AROUND_HINT_DELAY_MS, LookAround, type LookAroundProps } from './LookAround';

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

describe('the look-around hint', () => {
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
  /** Mounts a fresh hint (a new key each time, so no state carries over). */
  const render = (props: Partial<LookAroundProps> & Pick<LookAroundProps, 'scenes'>): HTMLButtonElement => {
    mounts++;
    act(() =>
      root.render(
        <LookAround
          key={mounts}
          onLookAround={() => {}}
          atTv={true}
          learnt={false}
          touch={false}
          handOver={{ current: false }}
          {...props}
        />,
      ),
    );
    return host.querySelector('button') as HTMLButtonElement;
  };
  const wait = (ms: number): void =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it('is always a button to the room, and shows itself ten seconds after the title first shows', () => {
    const scenes = director();
    const onLookAround = vi.fn();
    const button = render({ scenes, onLookAround });
    expect(button.getAttribute('aria-label')).toBe('Look around the room');
    expect(button.dataset.shown).toBe('false');
    // The boot does not count.
    wait(LOOK_AROUND_HINT_DELAY_MS * 2);
    expect(button.dataset.shown).toBe('false');
    act(() => scenes.show('title'));
    wait(LOOK_AROUND_HINT_DELAY_MS - 100);
    expect(button.dataset.shown).toBe('false');
    wait(100);
    expect(button.dataset.shown).toBe('true');
    expect(button.textContent).toContain('Click anywhere outside the TV');
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

  it('never shows once learnt, away from the TV, or once a level has started this visit', () => {
    const learnt = director('title');
    expect(render({ scenes: learnt, learnt: true }).dataset.shown).toBe('false');
    wait(LOOK_AROUND_HINT_DELAY_MS);
    expect(host.querySelector('button')?.dataset.shown).toBe('false');

    const flying = director('title');
    render({ scenes: flying, atTv: false });
    wait(LOOK_AROUND_HINT_DELAY_MS);
    expect(host.querySelector('button')?.dataset.shown).toBe('false');

    const playing = director('title');
    render({ scenes: playing });
    wait(LOOK_AROUND_HINT_DELAY_MS);
    expect(host.querySelector('button')?.dataset.shown).toBe('true');
    act(() => playing.show('level'));
    expect(host.querySelector('button')?.dataset.shown).toBe('false');
    act(() => playing.show('levelSelect'));
    expect(host.querySelector('button')?.dataset.shown).toBe('false');
  });

  it('speaks of taps on a touch screen', () => {
    const button = render({ scenes: director('title'), touch: true });
    expect(button.textContent).toContain('Tap anywhere outside the TV');
    expect(button.dataset.touch).toBe('true');
  });
});
