import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { stillCamera } from '../../src/app/startup/still/camera';
import { STILL, STILL_TEXTS } from '../../src/app/startup/still/data';
import { drawStill } from '../../src/app/startup/still/draw';
import { projectedBounds, regionFromInsets } from '../../src/room/camera/framing';
import { tvFixture } from '../../src/room/tv/tvFixtures';
import { tvViewpoint } from '../../src/room/tv/tvFraming';
import { encode, type Paint, type PaintedShape } from './encode';
import { fingerprint } from './fingerprint';
import { stillFraming } from './framing';
import { FAMILY, loadWorld, padInsets } from './world';

const source = JSON.parse(readFileSync(new URL('./source.json', import.meta.url), 'utf8')) as { fingerprint: string };
const colours = JSON.parse(readFileSync(new URL('./colours.json', import.meta.url), 'utf8')) as Record<string, Paint[]>;

describe('the startup still', () => {
  it('is made from the room as its generators build it now (else: pnpm build:still)', () => {
    expect(fingerprint(loadWorld(), stillFraming()), 'the still is stale: run `pnpm build:still`').toBe(
      source.fingerprint,
    );
  });

  it('has colours for the shapes it draws, and draws each of them', () => {
    const names = Object.keys(colours);
    // In a window wide enough for the opal lamp: a disc whose middle is off the page is not drawn.
    const { svg } = drawStill(STILL, STILL_TEXTS, 2560, 1080, padInsets(2560, 1080, false));
    // A shape is drawn once for each of its paints, a row of print once for each word as well.
    const drawn = (svg.match(/<(path|circle|text) /g) ?? []).length - (svg.match(/<clipPath/g) ?? []).length;
    const paints = Object.entries(colours).reduce(
      (sum, [name, own]) => sum + own.length * (name === 'legends' ? STILL_TEXTS.length - 1 : 1),
      0,
    );
    expect(drawn).toBe(paints);
    expect(names).toContain('shell');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('puts the game’s picture where the room will, to a twentieth of a pixel, at every viewport it is held to', () => {
    const { framing } = tvFixture();
    const up = new Vector3(0, 1, 0);
    for (const [width, height, touch] of FAMILY) {
      const insets = padInsets(width, height, touch);
      const viewport = { width, height };
      const view = tvViewpoint(framing, viewport, regionFromInsets(viewport, { top: 0, ...insets }));
      const bounds = projectedBounds(framing.picture, view, up, view.fov, width / height);
      const room = [
        ((bounds.left + 1) / 2) * width,
        ((1 - bounds.top) / 2) * height,
        ((bounds.right - bounds.left) / 2) * width,
        ((bounds.top - bounds.bottom) / 2) * height,
      ];
      const { picture } = drawStill(STILL, STILL_TEXTS, width, height, insets);
      picture.forEach((value, i) => {
        expect(Math.abs(value - (room[i] as number)), `${width}×${height}`).toBeLessThan(0.05);
      });
    }
  });

  it('reads back what was written: places to the half millimetre, colours as they are', () => {
    const framing = stillFraming();
    const shapes: PaintedShape[] = [
      {
        name: 'a',
        kind: 'loops',
        loops: [
          [
            [2.154, 0.5, -0.6],
            [2.154, 1.0755, -0.6],
            [2.154, 1.0755, -0.0403],
          ],
        ],
        paints: [{ kind: 'flat', colour: [3, 200, 77] }],
      },
    ];
    const { data, texts } = encode(framing, shapes);
    expect(data).toMatch(/^[(-;=-[\]-}]+$/);
    const [width, height] = [1440, 900];
    const { svg, picture } = drawStill(data, texts, width, height, padInsets(width, height, false));
    const camera = stillCamera(framing, width, height, padInsets(width, height, false));
    const corners = [...svg.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => [
      Number(match[1]),
      Number(match[2]),
    ]);
    const places = (shapes[0] as PaintedShape).loops[0]?.map((point) => camera.project(point)) ?? [];
    expect(corners.length).toBe(3);
    corners.forEach((corner, i) => {
      // A tenth of a pixel of rounding and a quarter of a millimetre, which is a third of a pixel here.
      expect(
        Math.hypot((corner[0] as number) - (places[i]?.[0] ?? 0), (corner[1] as number) - (places[i]?.[1] ?? 0)),
      ).toBeLessThan(0.55);
    });
    expect(svg).toContain('fill="rgb(3,200,77)"');
    // The picture's few points, a hundredth of a millimetre fine, are the framing's own.
    picture.forEach((value, i) => {
      expect(Math.abs(value - (camera.picture[i] as number))).toBeLessThan(0.03);
    });
  });
});
