import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import hotspots from './hotspots.json';

const css = readFileSync(new URL('./cursors.css', import.meta.url), 'utf8');

describe('the cursors', () => {
  it('point where scripts/build-cursors.ts says their hotspots are', () => {
    for (const [name, { x, y }] of Object.entries(hotspots)) {
      expect(css).toContain(`url("./${name}.png") 1x, url("./${name}@2x.png") 2x) ${x} ${y},`);
    }
  });
});
