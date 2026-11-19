import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  atlasPlan,
  CORK_DEPTH,
  fromSurface,
  GUTTER,
  PIN_CELL,
  PIN_RADIUS,
  pinnedItems,
  pinSpot,
  type Rect,
  SHADE_MARGIN,
  sheetPoint,
  tapeOutline,
  tapesOf,
  toSurface,
  WOOD_CELL,
} from '../wall/geometry';
import { CORKBOARD, type Corner, ITEMS, type PosterItem, type Surface } from '../wall/layout';
import { nightLight, type Rgb } from '../wall/light';
import { DESIGNS } from './designs';
import { type Ctx, disc, glow, grainTile, poly, ramp, rect, rnd, type Sheet, sheetOf } from './kit';

/*
 * The posters' atlas, painted: every sheet's design with what the wall does to it (the tape over its corners, the
 * folds it was posted with, a corner coming away, the shadow of the sheet pinned over it, paper grain) and then the
 * night's light multiplied in (wall/light.ts), so the walls draw unlit. It is painted in a worker where one can be had
 * (paint/worker.ts), and otherwise on the main thread a sheet per unit of the room's background work, after a few
 * units for the small things (the tape's overhangs, the pins, the skirts' ramp).
 */

/** What shows between islands (nothing samples it but the far mip levels). */
const BACKGROUND = '#3a3038';
/** Masking tape per surface: cream on the back wall's sage plaster, white paper tape on the pale slope. */
const TAPE: Readonly<Record<Surface, string>> = { back: 'rgba(238,230,203,0.62)', slope: 'rgba(247,247,243,0.9)' };
/** The wall's own colour under a strip of tape that overhangs a sheet, before the night's light. */
const WALL: Readonly<Record<Surface, string>> = { back: '#8f9f9a', slope: '#d9d0c4' };
/** How much of the light a finish keeps: gloss paper bakes darker away from its highlight. */
const FINISH = { matte: 1, satin: 0.94, 'semi-gloss': 0.9, gloss: 0.84 } as const;
/** The skirts' ramp: the wall keeps this much of its light where it meets a sheet. */
const CONTACT = 0.5;
const PIN_COLORS = ['#cc1410', '#1040c0', '#d8b410', '#148a22'] as const;
/** The lightmap's samples along each side of an island. */
const LIGHT_GRID = 5;

const CORNERS: Readonly<Record<Corner, readonly [number, number]>> = {
  BL: [-1, -1],
  BR: [1, -1],
  TR: [1, 1],
  TL: [-1, 1],
};

interface Painter {
  readonly c: Ctx;
  readonly canvas: Sheet;
  /** Canvas pixels per 2K texel: 1 or 0.5. */
  readonly scale: number;
  readonly grain: CanvasPattern;
  /** A few pixels of scratch for the lightmaps. */
  readonly light: Sheet;
}

/** The canvas's size at a tier's scale (1 for the 2K, 0.5 for the 1K). */
export function atlasSize(scale: number): readonly [number, number] {
  return [ATLAS_WIDTH * scale, ATLAS_HEIGHT * scale];
}

/**
 * Paints the atlas into `canvas` (already sized, atlasSize): one unit per `yield`. Run again from the start, it paints
 * the same picture (a lost canvas, docs/ROOM.md › Lost canvases). `sliced` is the main thread's way: every unit is
 * rasterized as it ends.
 */
export function* paintAtlas(canvas: Sheet, scale: number, sliced: boolean): Generator<void, void, void> {
  // CPU-backed, in the worker too: the strips that upload it read it row by row, where a GPU canvas would be read
  // back whole each time, and a bitmap of GPU pixels made in a worker does not outlive it (it uploaded black).
  const c = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as Ctx | null;
  if (!c) throw new Error('No 2D canvas for the posters');
  const painter: Painter = {
    c,
    canvas,
    scale,
    grain: c.createPattern(grainTile(128, 3, 46), 'repeat') as CanvasPattern,
    light: sheetOf(LIGHT_GRID, LIGHT_GRID),
  };
  yield;
  // A canvas only records what is drawn until its pixels are asked for: reading one back ends each unit, so a unit's
  // time is its own rasterizing, and nothing is left for the first strip's upload to pay in one go.
  const settle = (): void => {
    if (sliced) c.getImageData(0, 0, 1, 1);
  };
  const plan = atlasPlan();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  rect(c, BACKGROUND, 0, 0, canvas.width, canvas.height);
  settle();
  yield;
  for (const _ of small(painter)) {
    settle();
    yield;
  }
  for (const item of ITEMS) {
    sheet(painter, item, plan.cards.get(item.key) as Rect);
    settle();
    yield;
  }
  cork(painter, plan.cork);
  settle();
}

/** Runs `draw` clipped to an island, in 2K texels from its corner. */
function island(p: Painter, area: Rect, draw: () => void): void {
  const { c, scale } = p;
  c.save();
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.beginPath();
  c.rect(area.x, area.y, area.w, area.h);
  c.clip();
  c.translate(area.x, area.y);
  draw();
  c.restore();
}

/** The island's pixels on the canvas. */
function pixelsOf(p: Painter, area: Rect): [number, number, number, number] {
  return [area.x * p.scale, area.y * p.scale, area.w * p.scale, area.h * p.scale];
}

/** Multiplies the night's light into an island: sampled on a small grid over the sheet, interpolated between. */
function lit(p: Painter, area: Rect, at: (fu: number, fv: number) => Rgb, keep = 1): void {
  const context = p.light.getContext('2d') as Ctx;
  const image = context.createImageData(LIGHT_GRID, LIGHT_GRID);
  for (let j = 0; j < LIGHT_GRID; j++) {
    for (let i = 0; i < LIGHT_GRID; i++) {
      const [r, g, b] = at(i / (LIGHT_GRID - 1), 1 - j / (LIGHT_GRID - 1));
      image.data.set([r * keep * 255, g * keep * 255, b * keep * 255, 255], (j * LIGHT_GRID + i) * 4);
    }
  }
  context.putImageData(image, 0, 0);
  const { c } = p;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'multiply';
  c.imageSmoothingEnabled = true;
  // From sample centre to sample centre, so the island's corners get the corner samples.
  c.drawImage(p.light, 0.5, 0.5, LIGHT_GRID - 1, LIGHT_GRID - 1, ...pixelsOf(p, area));
  c.restore();
}

/** Paper grain over an island, and its edge pixels carried out into the gutter for the mip levels. */
function finish(p: Painter, area: Rect, grain: number): void {
  const { c, canvas } = p;
  const [x, y, w, h] = pixelsOf(p, area);
  const g = GUTTER * p.scale;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (grain > 0) {
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = grain;
    rect(c, p.grain, x, y, w, h);
    c.globalAlpha = 1;
  }
  c.globalCompositeOperation = 'source-over';
  c.imageSmoothingEnabled = false;
  c.drawImage(canvas, x, y, 1, h, x - g, y, g, h);
  c.drawImage(canvas, x + w - 1, y, 1, h, x + w, y, g, h);
  c.drawImage(canvas, x - g, y, w + 2 * g, 1, x - g, y - g, w + 2 * g, g);
  c.drawImage(canvas, x - g, y + h - 1, w + 2 * g, 1, x - g, y + h, w + 2 * g, g);
  c.restore();
}

/** A surface polygon's corners in a sheet's millimetres from its top-left. */
function onSheet(item: PosterItem, other: PosterItem, grow = 0): number[] {
  const out: number[] = [];
  for (const [su, sv] of Object.values(CORNERS)) {
    const [a, b] = toSurface(other, su * (other.w / 2 + grow), sv * (other.h / 2 + grow));
    const [u, v] = fromSurface(item, a, b);
    out.push((u + item.w / 2) * 1000, (item.h / 2 - v) * 1000);
  }
  return out;
}

/** The soft shadow a sheet (or anything with corners) drops on what it lies over. */
function shadow(
  p: Painter,
  points: readonly number[],
  texelsPerMm: number,
  blur: number,
  drop: number,
  alpha: number,
): void {
  const { c } = p;
  c.save();
  c.shadowColor = `rgba(8,6,16,${alpha})`;
  c.shadowBlur = blur * texelsPerMm * p.scale;
  c.shadowOffsetY = drop * texelsPerMm * p.scale;
  poly(c, '#000', points);
  c.restore();
}

function sheet(p: Painter, item: PosterItem, area: Rect): void {
  const { c } = p;
  const [w, h] = [item.w * 1000, item.h * 1000];
  const k = area.w / w;
  island(p, area, () => {
    c.scale(k, area.h / h);
    c.save();
    (DESIGNS[item.key] as (typeof DESIGNS)[string])(c, w, h);
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    // The folds it came out of the magazine with: a lit face and a shaded one along each.
    const [across, down] = item.creases ?? [0, 0];
    const fold = 1.4 / k;
    for (let i = 1; i <= across; i++) {
      const x = (w * i) / (across + 1);
      rect(c, 'rgba(255,255,255,0.2)', x - fold, 0, fold, h);
      rect(c, 'rgba(0,0,0,0.26)', x, 0, fold, h);
    }
    for (let i = 1; i <= down; i++) {
      const y = (h * i) / (down + 1);
      rect(c, 'rgba(0,0,0,0.26)', 0, y - fold, w, fold);
      rect(c, 'rgba(255,255,255,0.2)', 0, y, w, fold);
    }
    // A corner that has come away turns from the light.
    for (const [spot, amount] of Object.entries(item.curl ?? {}) as [Corner, number][]) {
      const [su, sv] = CORNERS[spot];
      const [x, y] = [((su + 1) / 2) * w, ((1 - sv) / 2) * h];
      const reach = 0.28 * Math.min(w, h);
      const dark = Math.min(0.5, amount * 26);
      rect(
        c,
        glow(c, x, y, reach, [
          [0, `rgba(10,8,20,${dark})`],
          [0.55, `rgba(10,8,20,${dark * 0.3})`],
          [0.8, 'rgba(255,255,255,0.07)'],
          [1, 'rgba(255,255,255,0)'],
        ]),
        x - reach,
        y - reach,
        reach * 2,
        reach * 2,
      );
    }
    // Gloss: a faint sheen across the sheet, from the window.
    if (item.finish === 'gloss' || item.finish === 'semi-gloss') {
      rect(
        c,
        ramp(c, 0, 0, w, h, [
          [0.1, 'rgba(190,200,255,0)'],
          [0.32, 'rgba(190,200,255,0.1)'],
          [0.5, 'rgba(190,200,255,0)'],
        ]),
        0,
        0,
        w,
        h,
      );
    }
    // What is pinned or taped over it shades it.
    for (const other of ITEMS) {
      if (other.surface !== item.surface || other.layer <= item.layer || !other.cork !== !item.cork) continue;
      const points = onSheet(item, other);
      const near = points.some((value, i) => value > -60 && value < (i % 2 ? h : w) + 60);
      if (near) shadow(p, points, k, 14, 5, 0.6);
    }
    // Its tape, where it lies on the paper.
    for (const tape of tapesOf(item)) {
      const points = tapeOutline(tape).flatMap(([u, v]) => [(u + item.w / 2) * 1000, (item.h / 2 - v) * 1000]);
      shadow(p, points, k, 2.5, 0.8, 0.3);
      poly(c, TAPE[item.surface], points);
    }
    if (item.cork) {
      const [u, v] = pinSpot(item);
      const [x, y] = [(u + item.w / 2) * 1000, (item.h / 2 - v) * 1000];
      disc(c, 'rgba(8,6,16,0.4)', x + 1.5, y + 3, PIN_RADIUS * 1250);
    }
  });
  lit(
    p,
    area,
    (fu, fv) => nightLight(item.surface, sheetPoint(item, (fu - 0.5) * item.w, (fv - 0.5) * item.h, 0)),
    FINISH[item.finish],
  );
  finish(p, area, item.finish === 'gloss' ? 0.1 : 0.2);
}

const BOARD = { ...CORKBOARD, surface: 'back', rot: 0, layer: 10 } as unknown as PosterItem;

function cork(p: Painter, area: Rect): void {
  const { c } = p;
  const [w, h] = [CORKBOARD.w * 1000, CORKBOARD.h * 1000];
  const k = area.w / w;
  island(p, area, () => {
    c.scale(k, area.h / h);
    rect(c, '#a8703c', 0, 0, w, h);
    // Cork: light and dark granules.
    for (let tone = 0; tone < 2; tone++) {
      c.fillStyle = tone ? 'rgba(60,32,10,0.4)' : 'rgba(232,180,120,0.35)';
      c.beginPath();
      for (let i = 0; i < 700; i++) {
        const [x, y, r] = [
          rnd(201 + tone, i * 3) * w,
          rnd(201 + tone, i * 3 + 1) * h,
          1.5 + 3.5 * rnd(201 + tone, i * 3 + 2),
        ];
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, 2 * Math.PI);
      }
      c.fill();
    }
    for (const item of pinnedItems()) shadow(p, onSheet(BOARD, item), k, 8, 4, 0.55);
    // The frame: pine, its inner edge shading the cork below and beside it.
    const frame = 20;
    c.lineWidth = frame;
    c.strokeStyle = ramp(c, 0, 0, 0, h, [
      [0, '#b98a58'],
      [1, '#8f6238'],
    ]);
    c.strokeRect(frame / 2, frame / 2, w - frame, h - frame);
    rect(
      c,
      ramp(c, 0, frame, 0, frame + 14, [
        [0, 'rgba(10,6,16,0.55)'],
        [1, 'rgba(10,6,16,0)'],
      ]),
      frame,
      frame,
      w - 2 * frame,
      14,
    );
    rect(
      c,
      ramp(c, frame, 0, frame + 9, 0, [
        [0, 'rgba(10,6,16,0.4)'],
        [1, 'rgba(10,6,16,0)'],
      ]),
      frame,
      frame,
      9,
      h - 2 * frame,
    );
    c.lineWidth = 1.2;
    c.strokeStyle = 'rgba(40,20,6,0.5)';
    c.strokeRect(frame, frame, w - 2 * frame, h - 2 * frame);
    for (const [x0, y0, x1, y1] of [
      [0, 0, frame, frame],
      [w, 0, w - frame, frame],
      [0, h, frame, h - frame],
      [w, h, w - frame, h - frame],
    ] as const) {
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
  });
  lit(p, area, (fu, fv) =>
    nightLight('back', sheetPoint(BOARD, (fu - 0.5) * CORKBOARD.w, (fv - 0.5) * CORKBOARD.h, CORK_DEPTH)),
  );
  finish(p, area, 0.25);
}

/** The tape's overhangs, the corkboard's edge, the pins' heads and the skirts' ramp, in a few units. */
function* small(p: Painter): Generator<void, void, void> {
  const { c, scale } = p;
  const plan = atlasPlan();
  const css = ([r, g, b]: Rgb, keep = 1): string => `rgb(${r * keep * 255},${g * keep * 255},${b * keep * 255})`;
  /** A small island of flat colour, painted out into its gutter (texels from its corner), under one light. */
  const flat = (area: Rect, light: Rgb, keep: number, draw: () => void): void => {
    const grown = { x: area.x - GUTTER, y: area.y - GUTTER, w: area.w + 2 * GUTTER, h: area.h + 2 * GUTTER };
    island(p, grown, () => {
      c.translate(GUTTER, GUTTER);
      draw();
      c.globalCompositeOperation = 'multiply';
      rect(c, css(light, keep), -GUTTER, -GUTTER, grown.w, grown.h);
    });
  };
  for (const [index, { item, tape, rect: area }] of plan.tapes.entries()) {
    // Thirty-odd strips to a unit.
    if (index % 32 === 31) yield;
    flat(area, nightLight(item.surface, sheetPoint(item, tape.u, tape.v, 0)), 1, () => {
      rect(c, WALL[item.surface], -GUTTER, -GUTTER, area.w + 2 * GUTTER, area.h + 2 * GUTTER);
      rect(c, TAPE[item.surface], -GUTTER, -GUTTER, area.w + 2 * GUTTER, area.h + 2 * GUTTER);
      // Crepe: a few faint ribs across the strip.
      for (let x = 3; x < area.w; x += 6) rect(c, 'rgba(60,50,30,0.07)', x, -GUTTER, 2, area.h + 2 * GUTTER);
    });
  }
  yield;
  const board = nightLight('back', sheetPoint(BOARD, 0, 0, CORK_DEPTH));
  flat(plan.wood, board, 1, () => {
    // Bottom, right, top, left: the top edge catches what light there is.
    [0.45, 0.7, 1, 0.6].forEach((keep, side) => {
      const [x, w] = [side * WOOD_CELL - (side ? 0 : GUTTER), WOOD_CELL + (side % 3 ? 0 : GUTTER)];
      rect(c, '#a67848', x, -GUTTER, w, WOOD_CELL + 2 * GUTTER);
      rect(c, `rgba(0,0,0,${1 - keep})`, x, -GUTTER, w, WOOD_CELL + 2 * GUTTER);
    });
  });
  flat(plan.pins, board, 1.5, () => {
    pinnedItems().forEach((_item, index) => {
      const color = PIN_COLORS[index % PIN_COLORS.length] as string;
      const [x, y] = [(index + 0.5) * PIN_CELL, PIN_CELL / 2];
      rect(c, color, index * PIN_CELL - GUTTER, -GUTTER, PIN_CELL + 2 * GUTTER, PIN_CELL + 2 * GUTTER);
      disc(
        c,
        glow(c, x - 1, y - 1, 4, [
          [0, 'rgba(255,255,255,0.75)'],
          [1, 'rgba(255,255,255,0)'],
        ]),
        x,
        y,
        4,
      );
      // The foot of the head, in its own shade.
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(x, y, 5, 0, 2 * Math.PI);
      c.stroke();
    });
  });
  // The skirts' ramp, wide white margins around it: its top rows must stay exactly white on every mip level.
  const shade = plan.shade;
  c.save();
  c.setTransform(scale, 0, 0, scale, 0, 0);
  rect(c, '#fff', shade.x - GUTTER, shade.y - GUTTER, shade.w + 2 * GUTTER, shade.h + 2 * GUTTER);
  const stops: [number, string][] = [];
  for (let i = 0; i <= 8; i++) stops.push([i / 8, css([1, 1, 1], 1 - (1 - CONTACT) * (i / 8) ** 2.2)]);
  const [top, bottom] = [shade.y + SHADE_MARGIN, shade.y + shade.h - SHADE_MARGIN];
  rect(
    c,
    ramp(c, 0, top, 0, bottom, stops),
    shade.x - GUTTER,
    top,
    shade.w + 2 * GUTTER,
    shade.h - SHADE_MARGIN + GUTTER,
  );
  c.restore();
  yield;
}
