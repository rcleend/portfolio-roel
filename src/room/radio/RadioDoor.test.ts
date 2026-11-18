import { describe, expect, it, vi } from 'vitest';
import { RadioDoorHandle } from './RadioDoor';

function door(): RadioDoorHandle {
  const container = {} as HTMLElement;
  const reducedMotion = { matches: false } as MediaQueryList;
  return new RadioDoorHandle(container, reducedMotion, () => new Promise(() => {}));
}

describe('RadioDoorHandle', () => {
  it("lets the camera go at once when nobody has a half to make ready, and after the app's when it has", async () => {
    const radio = door();
    await expect(radio.boardApp()).resolves.toBeUndefined();

    let mounted: () => void = () => {};
    const listener = vi.fn(() => new Promise<void>((resolve) => (mounted = resolve)));
    radio.onBoarding(listener);
    // One that has nothing to wait for says so by returning nothing.
    radio.onBoarding(() => undefined);
    const boarded = vi.fn();
    void radio.boardApp().then(boarded);
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledOnce();
    expect(boarded).not.toHaveBeenCalled();
    mounted();
    await vi.waitFor(() => expect(boarded).toHaveBeenCalledOnce());
  });

  it('never keeps the camera for a half that failed, nor asks a listener that has left', async () => {
    const radio = door();
    radio.onBoarding(() => Promise.reject(new Error('The player failed to load')));
    const gone = vi.fn(() => undefined);
    radio.onBoarding(gone)();
    await expect(radio.boardApp()).resolves.toBeUndefined();
    expect(gone).not.toHaveBeenCalled();
  });
});
