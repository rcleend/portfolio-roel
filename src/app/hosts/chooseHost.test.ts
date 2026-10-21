import { describe, expect, it } from 'vitest';
import { chooseHost } from './chooseHost';

describe('chooseHost', () => {
  it('honours an explicit host', () => {
    expect(chooseHost('flat', () => true)).toBe('flat');
    expect(chooseHost('room', () => false)).toBe('room');
  });

  it('falls back on WebGL availability', () => {
    expect(chooseHost(null, () => true)).toBe('room');
    expect(chooseHost('bogus', () => false)).toBe('flat');
  });
});
