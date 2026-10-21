import { Mask } from '../raster/Mask';
import { polygon, rect, roundedRect, type Shape, shear, subtract, translate, union } from '../raster/shape';

/**
 * "RCL", the publisher mark under the boot logo — heavy, extended and
 * italic, like the SNK mark it stands in for: fat bars, rounded outer
 * corners and counters squeezed into thin horizontal slits.
 */
const HEIGHT = 20;
const SLANT = 0.3;
const SPACING = 3;

function letterR(): Shape {
  const width = 24;
  return union(
    rect(0, 0, 7, HEIGHT),
    subtract(roundedRect(0, 0, width, 12, [0, 6, 6, 0]), rect(7, 4, width - 6, 8)),
    polygon([
      [13, 11],
      [21, 11],
      [width + 1, HEIGHT],
      [17, HEIGHT],
    ]),
  );
}

function letterC(): Shape {
  return subtract(roundedRect(0, 0, 24, HEIGHT, [7, 3, 3, 7]), rect(8, 7, 25, HEIGHT - 7));
}

function letterL(): Shape {
  return union(rect(0, 0, 8, HEIGHT), rect(0, HEIGHT - 7, 21, HEIGHT));
}

/** The monogram as a mask, roughly 80 × 20 px. */
export function buildMonogram(): Mask {
  const letters: readonly [Shape, number][] = [
    [letterR(), 25],
    [letterC(), 24],
    [letterL(), 21],
  ];
  const placed: Shape[] = [];
  let pen = 0;
  for (const [shape, width] of letters) {
    placed.push(translate(shape, pen, 0));
    pen += width + SPACING;
  }
  const mask = Mask.fromShape(Math.ceil(pen + HEIGHT * SLANT), HEIGHT, shear(union(...placed), SLANT, HEIGHT));
  const ink = mask.bounds();
  if (!ink) throw new Error('Monogram: rendered no ink');
  return mask.crop(ink);
}
