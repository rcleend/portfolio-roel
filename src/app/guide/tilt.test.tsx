// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@/room';
import { useTiltLook } from './tilt';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ room }: { readonly room: Room }): null {
  useTiltLook(room, true, true);
  return null;
}

function orientation(beta: number, gamma: number): Event {
  return Object.assign(new Event('deviceorientation'), { beta, gamma, alpha: 0 });
}

describe('the phone tilt look-around', () => {
  let host: HTMLDivElement;
  let root: Root;
  let setTilt: ReturnType<typeof vi.fn>;
  let room: Room;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    setTilt = vi.fn();
    room = { setTilt } as unknown as Room;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('follows orientation events where the browser delivers them without asking', () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {});
    act(() => root.render(<Harness room={room} />));
    act(() => {
      window.dispatchEvent(orientation(40, 0));
      window.dispatchEvent(orientation(40, 9));
    });
    expect(setTilt).toHaveBeenCalled();
    expect(setTilt.mock.lastCall?.[0].x).toBeGreaterThan(0);
  });

  it('never asks for motion access, and has no tilt where the browser would want permission (iOS)', () => {
    const requestPermission = vi.fn(() => Promise.resolve('granted'));
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(class extends Event {}, { requestPermission }));
    act(() => root.render(<Harness room={room} />));
    act(() => {
      for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
        window.dispatchEvent(new Event(type));
      }
      window.dispatchEvent(orientation(40, 0));
      window.dispatchEvent(orientation(40, 9));
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(setTilt).not.toHaveBeenCalledWith(expect.objectContaining({ x: expect.any(Number) }));
  });
});
