import { Bitmap } from '../raster/Bitmap';
import { Mask } from '../raster/Mask';

/** The small "TM" beside the logo, drawn by hand: the label font's caps are too small to carry an outline. */
const TRADEMARK = Mask.fromRows([
  '######.##...##',
  '######.###.###',
  '..##...#######',
  '..##...##.#.##',
  '..##...##...##',
  '..##...##...##',
]);

/** Cream letters in a dark 1 px outline, like the rest of the lockup. */
export function paintTrademark(fill: string, outline: string): Bitmap {
  const padded = new Mask(TRADEMARK.width + 2, TRADEMARK.height + 2).union(TRADEMARK, 1, 1);
  const bitmap = new Bitmap(padded.width, padded.height);
  bitmap.fill(padded.outline(), outline);
  bitmap.fill(padded, fill);
  return bitmap;
}
