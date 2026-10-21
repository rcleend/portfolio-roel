import { describe, expect, it } from 'vitest';
import { outlined } from './outline';

describe('outlined', () => {
  it('pads the art and rims it with the outline key, corners included', () => {
    expect(outlined(['g'], 'o')).toEqual(['ooo', 'ogo', 'ooo']);
    expect(outlined(['g.', '.g'], 'o')).toEqual(['ooo.', 'ogoo', 'oogo', '.ooo']);
  });
});
