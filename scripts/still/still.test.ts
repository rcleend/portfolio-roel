import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { stillCamera } from '../../src/app/startup/still/camera';
import { STILL, STILL_IMAGE, STILL_IMAGE_SMALL, STILL_TEXTS } from '../../src/app/startup/still/data';
import { drawStill } from '../../src/app/startup/still/draw';
import { projectedBounds, regionFromInsets } from '../../src/room/camera/framing';
import { tvFixture } from '../../src/room/tv/tvFixtures';
import { tvViewpoint } from '../../src/room/tv/tvFraming';
import { encode, type Paint, type PaintedShape } from './encode';
import { fingerprint } from './fingerprint';
import { pageVignette } from './finish';
import { stillFraming } from './framing';
import { FAMILY, loadWorld, padInsets } from './world';

const source = JSON.parse(readFileSync(new URL('./source.json', import.meta.url), 'utf8')) as {
  fingerprint: string;
  image: Record<string, string>;
};
const colours = JSON.parse(readFileSync(new URL('./colours.json', import.meta.url), 'utf8')) as Record<
  string,
  Paint[] | { strengths: number[] }
>;

describe('the startup still', () => {
  it('is made from the room as its generators build it now (else: pnpm build:still)', () => {
    expect(fingerprint(loadWorld(), stillFraming()), 'the still is stale: run `pnpm build:still`').toBe(
      source.fingerprint,
    );
  });

  it('has colours for the shapes it draws, and draws each of them', () => {
    // In a window wide enough for the opal lamp: a disc whose middle is off the page is not drawn.
    const { svg } = drawStill(STILL, STILL_TEXTS, 2560, 1080, padInsets(2560, 1080, false));
    const all = Object.values(colours);
    const paints = all.flatMap((sampled) => (Array.isArray(sampled) ? sampled : []));
    // A field is three elements of the page, a gradient of its backgrounds a row; any other paint one drawn element
    // (a row of print one a word).
    const rows = paints.reduce((sum, paint) => sum + (paint.kind === 'field' ? paint.rows.length : 0), 0);
    const fields = paints.filter((paint) => paint.kind === 'field').length;
    expect((svg.match(/linear-gradient\(90deg/g) ?? []).length).toBe(rows);
    expect((svg.match(/<i style="clip-path/g) ?? []).length).toBe(fields);
    // Every drawing between the fields is closed, and none is empty.
    expect((svg.match(/<svg /g) ?? []).length).toBe((svg.match(/<\/svg>/g) ?? []).length);
    expect(svg).not.toMatch(/<svg[^>]*><\/svg>/);
    const drawn = (svg.match(/<(path|circle|text) (?!clip-rule)[^>]*fill="(rgb|url)/g) ?? []).length;
    expect(drawn).toBe(
      Object.entries(colours).reduce(
        (sum, [name, sampled]) =>
          sum +
          (Array.isArray(sampled) ? sampled.filter((paint) => paint.kind !== 'field').length : 0) *
            (name === 'legends' ? STILL_TEXTS.length - 1 : 1),
        // The vignette, which has no paint of its own.
        1,
      ),
    );
    // What the set shows when it is on is the first drawing's last group; what its picture lights, in the picture's
    // colour, a second drawing.
    const lines = all.reduce((sum, sampled) => sum + (Array.isArray(sampled) ? 0 : sampled.strengths.length), 0);
    expect(svg).toMatch(/<g class="o">.*<\/g><\/svg><svg class="t" [^>]*>.*<\/svg>$/);
    expect((svg.match(/stroke-opacity/g) ?? []).length).toBe(lines);
    expect(svg.slice(svg.indexOf('<svg class="t"'))).not.toMatch(/rgb\(/);
    expect(Object.keys(colours)).toContain('shell');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('has its two images beside it, a piece for each surface that says so, and draws what is in them only until one is in', async () => {
    // Named by their own pixels and held by their checksums (build.ts): a still built again without its images
    // written, or an image put there by hand, fails here.
    const count: Record<string, number> = {};
    for (const [kind, address, key] of [
      ['', STILL_IMAGE, 'tile'],
      ['small.', STILL_IMAGE_SMALL, 'small'],
    ] as const) {
      const file = (ending: string): URL => new URL(`../../public${address}.${ending}`, import.meta.url);
      for (const ending of ['avif', 'webp'] as const) {
        expect(existsSync(file(ending)), `${address}.${ending} is in public/startup`).toBe(true);
        expect(
          createHash('sha1')
            .update(readFileSync(file(ending)))
            .digest('hex'),
          `${address}.${ending} is the one the still’s build wrote`,
        ).toBe(source.image[`${kind}${ending}`]);
      }
      const info = await sharp(readFileSync(file('webp'))).metadata();
      const pieces = Object.values(colours).flatMap((sampled) =>
        Array.isArray(sampled)
          ? sampled.flatMap((paint) => (paint.kind === 'field' && paint[key] ? [paint[key]] : []))
          : [],
      );
      count[key] = pieces.length;
      for (const [left, top, wide, high] of pieces) {
        expect(left + wide).toBeLessThanOrEqual(info.width ?? 0);
        expect(top + high).toBeLessThanOrEqual(info.height ?? 0);
      }
      // In the nominal window a piece is one layer; the small image's pieces are the full one's with fewer texels.
      const { svg } = drawStill(
        STILL,
        STILL_TEXTS,
        1440,
        900,
        padInsets(1440, 900, false),
        undefined,
        undefined,
        key === 'small',
      );
      expect((svg.match(/<i class="p"/g) ?? []).length).toBe(pieces.length);
      expect(svg).not.toMatch(/matrix\([^)]*(NaN|Infinity)/);
      // The print, the jacks and the filament are in the image: their drawn ones go when it is in (index.html › .v).
      expect((svg.match(/class="v"/g) ?? []).length).toBeGreaterThanOrEqual(STILL_TEXTS.length + 4);
    }
    expect(count.tile).toBeGreaterThan(10);
    // A phone's image has the pieces a phone shows: not all of them, and the set's among them.
    expect(count.small).toBeGreaterThan(10);
    expect(count.small).toBeLessThan(count.tile as number);
    expect(STILL_IMAGE).toMatch(/^\/startup\/still-[0-9a-f]{8}$/);
    expect(STILL_IMAGE_SMALL).toMatch(/^\/startup\/small-[0-9a-f]{8}$/);
  });

  it('reads the finish’s vignette from the finish, darker the further from the page’s middle', () => {
    const vignette = pageVignette();
    expect(vignette.stops[0]).toBe(0);
    vignette.stops.forEach((stop, i) => {
      expect(stop).toBeGreaterThanOrEqual(vignette.stops[i - 1] ?? 0);
    });
    expect(vignette.stops.at(-1)).toBeGreaterThan(0.05);
    expect(vignette.stops.at(-1)).toBeLessThan(0.6);
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
