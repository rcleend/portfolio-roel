import { describe, expect, it } from 'vitest';
import { onFirstGesture } from './firstGesture';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('onFirstGesture', () => {
  it('unlocks once on the first gesture and then stops listening', async () => {
    const target = new EventTarget();
    let attempts = 0;
    onFirstGesture(target, async () => {
      attempts++;
    });
    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    target.dispatchEvent(new Event('keydown'));
    await flush();
    expect(attempts).toBe(1);
  });

  it('keeps listening while the attempt is refused', async () => {
    const target = new EventTarget();
    let attempts = 0;
    onFirstGesture(target, () => {
      attempts++;
      return attempts < 2 ? Promise.reject(new Error('not allowed')) : Promise.resolve();
    });
    target.dispatchEvent(new Event('touchstart'));
    await flush();
    target.dispatchEvent(new Event('touchend'));
    await flush();
    target.dispatchEvent(new Event('click'));
    await flush();
    expect(attempts).toBe(2);
  });

  it('can be cancelled before any gesture', async () => {
    const target = new EventTarget();
    let attempts = 0;
    const stop = onFirstGesture(target, async () => {
      attempts++;
    });
    stop();
    target.dispatchEvent(new Event('keydown'));
    await flush();
    expect(attempts).toBe(0);
  });
});
