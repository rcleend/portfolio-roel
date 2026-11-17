/**
 * A field of the startup still as SVG (docs/ROOM.md › Startup), for the still's build, which draws the still without
 * a browser (fit.ts › render): what `draw.ts` draws for the page with CSS gradients, as gradient elements. A row is a
 * line across the page, its colours a gradient along it; the even rows are drawn each from the row above it to the
 * row below, and the odd ones over them through a mask that is white on the odd rows and black on the even ones.
 */
import type { FieldPainter } from '../../src/app/startup/still/draw';

export const svgField: FieldPainter = (outline, rows, across, width, height, id) => {
  const [first, last] = [(rows[0] as (typeof rows)[number]).y, (rows.at(-1) as (typeof rows)[number]).y];
  const bands = ['', ''];
  let [defs, ramp] = ['', ''];
  rows.forEach(({ y, from, to, colours }, row) => {
    defs += `<linearGradient id="${id}r${row}" gradientUnits="userSpaceOnUse" x1="${from}" x2="${to}">${colours
      .map((rgb, i) => `<stop offset="${across[i]}" stop-color="rgb(${rgb})"/>`)
      .join('')}</linearGradient>`;
    const top = rows[row - 1]?.y ?? -9e3;
    bands[row & 1] +=
      `<rect y="${top}" width="${width}" height="${(rows[row + 1]?.y ?? 9e3) - top}" fill="url(#${id}r${row})"/>`;
    ramp += `<stop offset="${(y - first) / (last - first)}" stop-color="#${row & 1 ? 'fff' : '000'}"/>`;
  });
  return `${defs}<clipPath id="${id}"><path d="${outline}"/></clipPath><linearGradient id="${id}v" gradientUnits="userSpaceOnUse" x2="0" y1="${first}" y2="${last}">${ramp}</linearGradient><mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="url(#${id}v)"/></mask><g clip-path="url(#${id})">${bands[0]}<g mask="url(#${id}m)">${bands[1]}</g></g>`;
};
