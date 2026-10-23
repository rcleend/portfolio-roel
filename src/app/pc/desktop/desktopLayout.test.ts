import { describe, expect, it } from 'vitest';
import { centreOf, DESKTOP_ICONS, desktopLayout, type Rect } from './desktopLayout';

const SIZES = [
  { width: 874, height: 687 },
  { width: 700, height: 550 },
  { width: 1049, height: 824 },
  { width: 800, height: 630 },
];

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe('desktopLayout', () => {
  it.each(SIZES)(
    'puts the taskbar, start, task button and tray along the bottom at $width × $height',
    ({ width, height }) => {
      const layout = desktopLayout(width, height);
      expect(layout.taskbar).toEqual({ x: 0, y: height - 30, width, height: 30 });
      expect(layout.start).toEqual({ x: 0, y: height - 30, width: 100, height: 30 });
      expect(layout.taskButton).toEqual({ x: 106, y: height - 27, width: 160, height: 24 });
      expect(layout.tray).toEqual({ x: width - 84, y: height - 30, width: 84, height: 30 });
      expect(inside(layout.startMark, layout.start)).toBe(true);
      expect(layout.startTextX).toBeGreaterThan(layout.startMark.x + layout.startMark.width);
    },
  );

  it.each(SIZES)(
    'lays the icons out in a column above the taskbar, CV first, at $width × $height',
    ({ width, height }) => {
      const layout = desktopLayout(width, height);
      expect(layout.icons.map((icon) => icon.id)).toEqual(DESKTOP_ICONS.map((icon) => icon.id));
      expect(layout.icons[0]?.label).toBe('Roel Leenders CV.pdf');
      expect(layout.icons[0]?.cell).toEqual({ x: 8, y: 10, width: 74, height: 78 });
      expect(layout.icons[0]?.art).toEqual({ x: 29, y: 14, width: 32, height: 32 });
      expect(layout.icons[0]?.labelBox).toEqual({ x: 10, y: 50, width: 70, height: 26 });
      for (const icon of layout.icons) {
        expect(inside(icon.art, icon.cell)).toBe(true);
        expect(inside(icon.labelBox, icon.cell)).toBe(true);
        expect(overlaps(icon.art, icon.labelBox)).toBe(false);
        expect(icon.cell.y + icon.cell.height).toBeLessThanOrEqual(layout.taskbar.y);
      }
    },
  );

  it.each(SIZES)('never overlaps two pieces of chrome at $width × $height', ({ width, height }) => {
    const layout = desktopLayout(width, height);
    const pieces = [layout.start, layout.taskButton, layout.tray, ...layout.icons.map((icon) => icon.cell)];
    for (const [index, piece] of pieces.entries()) {
      for (const other of pieces.slice(index + 1)) expect(overlaps(piece, other)).toBe(false);
    }
  });

  it('shows only the icons that fit above the taskbar on short layouts, but always the CV', () => {
    expect(desktopLayout(800, 200).icons.map((icon) => icon.id)).toEqual(['cv', 'projects']);
    expect(desktopLayout(800, 117).icons.map((icon) => icon.id)).toEqual(['cv']);
    expect(desktopLayout(800, 60).icons.map((icon) => icon.id)).toEqual(['cv']);
  });

  it('shortens the task button on narrow layouts instead of running under the tray', () => {
    const layout = desktopLayout(320, 240);
    expect(layout.taskButton.x + layout.taskButton.width).toBeLessThan(layout.tray.x);
  });

  it('aims the scripted cursor at the centre of the CV art', () => {
    const cv = desktopLayout(874, 687).icons[0];
    expect(cv && centreOf(cv.art)).toEqual({ x: 45, y: 30 });
  });
});
