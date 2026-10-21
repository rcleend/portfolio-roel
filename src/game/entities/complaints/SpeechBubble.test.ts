import { describe, expect, it } from 'vitest';
import { SpeechBubble } from './SpeechBubble';

const TEXT = { lines: ['WHY AM I', 'IN SPAM?'], width: 40, height: 19, lineHeight: 10 };

describe('SpeechBubble', () => {
  it('starts in front of the speaker and drifts the way they face', () => {
    const left = new SpeechBubble(TEXT, 200, 180, -1, 50);
    expect(left.x + left.width).toBe(200);
    left.update(1);
    expect(left.x + left.width).toBe(150);
    const right = new SpeechBubble(TEXT, 200, 180, 1, 50);
    expect(right.x).toBe(200);
  });

  it('has a forgiving hitbox inside its outline', () => {
    const bubble = new SpeechBubble(TEXT, 0, 100, 1, 50);
    expect(bubble.rect.w).toBeLessThan(bubble.width);
    expect(bubble.rect.h).toBeLessThan(bubble.height);
  });

  it('dies when popped or after its lifetime', () => {
    const popped = new SpeechBubble(TEXT, 0, 100, 1, 50);
    popped.pop();
    expect(popped.alive).toBe(false);
    const old = new SpeechBubble(TEXT, 0, 100, 1, 50);
    for (let i = 0; i < 300; i++) old.update(1 / 60);
    expect(old.alive).toBe(false);
  });
});
