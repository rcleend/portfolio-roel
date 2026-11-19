/**
 * Draws the startup still (docs/ROOM.md › Startup): the room's TV view as an SVG, from outlines in the room's own
 * space (`data.ts`, generated from the room's generators by `pnpm build:still`) through the room's own camera
 * (`camera.ts`), so it stands where the live room will at any viewport. Minified into index.html: no imports but
 * the camera, nothing of the DOM (`inline.ts` is its page side).
 *
 * The data is one string of whole numbers (`scripts/still/encode.ts` writes it and says what they are): a number is
 * base-42 digits, least first, a digit of 42 or more saying another follows.
 */
import { type Point, type StillInsets, stillCamera } from './camera';

/** The data's units in metres: two millimetres of depth, half millimetres across and up. */
const DEPTH = 2e-3;
const UNIT = 5e-4;
/** The room's buffer pixels a CSS pixel in the nominal view (1440 × 900 at two or more a pixel): three megapixels' worth. */
const NOMINAL_RATIO = Math.sqrt(3e6 / (1440 * 900));
/** A field's lines are placed in this many steps from one end of it to the other. */
const FIELD = 96;

/** A row of a field: where it is down the page, where its colours begin and end along it, and the colours. */
export interface FieldRow {
  readonly y: number;
  readonly from: number;
  readonly to: number;
  readonly colours: readonly (readonly number[])[];
}

/** Draws a field: `rows` of colours at the places `across` (0–1 along each row), cut to `outline`. */
export type FieldPainter = (
  outline: string,
  rows: readonly FieldRow[],
  across: readonly number[],
  width: number,
  height: number,
  id: string,
  image?: FieldImage,
) => string;

/**
 * A field's rendered picture: its place in the still's image (left, top, width, height), and the bands of it down
 * the page, each from a row of the piece (`from`, `high` rows of it) with the transform that lays it on the page.
 */
export interface FieldImage {
  readonly tile: readonly number[];
  readonly bands: readonly { readonly from: number; readonly high: number; readonly matrix: readonly number[] }[];
}

/**
 * A field as the page draws it: three elements over the whole still, cut to the outline. A row's colours are a
 * gradient across the page; between two rows the picture goes from one to the other: the even rows are one element's
 * backgrounds, each from the row above it to the row below, and the odd ones a second element's over them, through a
 * mask that is solid on the odd rows and clear on the even ones. (As SVG this was a gradient element a row and a stop
 * element a colour, some 2,500 elements in all, which cost the first paint a style pass ten times as long.)
 */
const pageField: FieldPainter = (outline, rows, across, _width, _height, _id, image) => {
  const layers = ['', ''];
  rows.forEach(({ from, to, colours }, row) => {
    // The first and the last row go on past the page's ends, as a row off the page does.
    const top = rows[row - 1]?.y ?? -9e3;
    layers[row & 1] +=
      `${layers[row & 1] ? ',' : ''}linear-gradient(90deg,${colours.map((rgb, i) => `rgb(${rgb}) ${(from + (to - from) * (across[i] as number)).toFixed(1)}px`)}) 0 ${top}px/100% ${(rows[row + 1]?.y ?? 9e3) - top}px no-repeat`;
  });
  // The rendered picture over the gradients, once the still's image is in (index.html › .p): its piece of the image
  // in bands, each laid where this window's camera has it.
  const [left, top, wide] = image?.tile ?? [];
  const picture = (image?.bands ?? [])
    .map(
      ({ from, high, matrix }) =>
        `<i class="p" style="width:${wide}px;height:${high}px;background-position:${-(left as number)}px ${-((top as number) + from)}px;transform:matrix(${matrix})"></i>`,
    )
    .join('');
  return `<i style="clip-path:path(evenodd,'${outline}')"><i style="background:${layers[0]}"></i><i style="background:${layers[1]};-webkit-mask:linear-gradient(${rows.map(({ y }, row) => `#000${row & 1 ? '' : '0'} ${y}px`)})"></i>${picture}</i>`;
};

export interface DrawnStill {
  readonly svg: string;
  /** The game's picture: left, top, width, height in CSS px. */
  readonly picture: readonly [number, number, number, number];
}

export function drawStill(
  data: string,
  texts: readonly string[],
  width: number,
  height: number,
  insets: StillInsets,
  field: FieldPainter = pageField,
  /** The room's drawing-buffer pixels a CSS pixel in this window (stage/quality.ts › pixelRatioFor); the nominal view's where it is left out. */
  ratio = NOMINAL_RATIO,
  /** The pieces' places are the small image's. */
  small = false,
): DrawnStill {
  let at = 0;
  /** The next number of the data, and the next signed one. */
  const next = (): number => {
    let value = 0;
    let scale = 1;
    let digit: number;
    do {
      const code = data.charCodeAt(at++);
      digit = code - 40 - +(code > 60) - +(code > 92);
      value += (digit % 42) * scale;
      scale *= 42;
    } while (digit > 41);
    return value;
  };
  const signed = (): number => {
    const value = next();
    return value & 1 ? -(value + 1) / 2 : value / 2;
  };
  const point = (): Point => [signed() * DEPTH, signed() * UNIT, signed() * UNIT];

  // The framing model, a hundredth of a millimetre fine: the set's bounds and the picture's outline.
  const fine = (): Point => [signed() * 1e-5, signed() * 1e-5, signed() * 1e-5];
  const outlined = next();
  const framing = { bounds: [fine(), fine()] as [Point, Point], picture: Array.from({ length: outlined }, fine) };
  const camera = stillCamera(framing, width, height, insets);
  // The nominal view's camera: the still's image is the room as it sees it.
  const nominal = stillCamera(framing, 1440, 900, { left: 0, right: 0, bottom: 0 });
  const px = (value: number): number => +value.toFixed(1);
  const colour = (): string => `rgb(${next()},${next()},${next()})`;

  const head = `<svg width="${width}" height="${height}" fill-rule="evenodd">`;
  let svg = head;
  let gradients = 0;
  /** How much larger than its place in the room the shape being drawn is: a lamp's bloom (below). */
  let grow = 1;
  let text = 0;
  /** A paint's fill; none for a field, which draws itself, cut to the shape's `outline`. */
  const paint = (outline: string): string => {
    const kind = next();
    if (!kind) return colour();
    const id = `still${gradients++}`;
    if (kind > 2) {
      // A grid of colours on a plane of the room: its rows are lines across the page (`field` draws it).
      const axis = next();
      const plane = signed();
      const ends = [signed() * UNIT, signed() * UNIT];
      const [v0, v1] = [signed(), signed()];
      /** Where a grid's lines are, 0–1: a count, then each line's step from the one before it. */
      const places = (): number[] => {
        let place = 0;
        return Array.from({ length: next() }, (_, i) => {
          if (i) place += next();
          return place / FIELD;
        });
      };
      const across = places();
      const down = places();
      const line = (row: number): [number, number][] =>
        ends.map((z) => {
          const v = v0 + (v1 - v0) * (down[row] as number);
          return camera.project(axis ? [v * DEPTH, plane * UNIT, z] : [plane * DEPTH, v * UNIT, z]);
        });
      // A colour is given as what it has more than its neighbours foretell: the one before it in its row and the one
      // above, less the one above that one.
      let above: number[][] = [];
      const lines = down.map((_, row): FieldRow => {
        const here: number[][] = [];
        const [from, to] = line(row) as [[number, number], [number, number]];
        for (let column = 0; column < across.length; column++)
          here.push(
            [0, 1, 2].map(
              (channel) =>
                (here[column - 1]?.[channel] ?? 0) +
                (above[column]?.[channel] ?? 0) -
                (above[column - 1]?.[channel] ?? 0) +
                signed(),
            ),
          );
        above = here;
        return { y: from[1], from: from[0], to: to[0], colours: here };
      });
      // The surface's rendered picture: a piece of the still's image, which is the surface as the nominal view
      // (1440 × 900) sees it. A row of the surface is a line across both pages, so along it the piece goes onto this
      // window's page by a scale and a shift; from row to row those change as the rows' depths do, exactly alike
      // where this window's eye is the nominal one (then one band does), and else by a little, which bands follow:
      // as many as keep the piece within a quarter of a pixel of where it belongs.
      // (Its place in the full image, then in the small one, which has the pieces a phone shows: `small` says which.)
      const both = Array.from({ length: 8 }, next);
      const tile = both.slice(small ? 4 : 0, small ? 8 : 4);
      const bands: { from: number; high: number; matrix: number[] }[] = [];
      if (tile[2]) {
        const wide = tile[2] as number;
        /** A row of the surface (0–1 down it) on a camera's page: its ends' x, and its y. */
        const across = (view: typeof camera, t: number): number[] => {
          const [from, to] = ends.map((z) => {
            const v = v0 + (v1 - v0) * t;
            return view.project(axis ? [v * DEPTH, plane * UNIT, z] : [plane * DEPTH, v * UNIT, z]);
          }) as [[number, number], [number, number]];
          return [from[0], to[0], from[1]];
        };
        const [first, last] = [across(nominal, 0), across(nominal, 1)] as [number[], number[]];
        const leftmost = Math.min(first[0] as number, first[1] as number, last[0] as number, last[1] as number);
        const span = Math.max(first[0] as number, first[1] as number, last[0] as number, last[1] as number) - leftmost;
        const [kx, ky] = [wide / span, (tile[3] as number) / ((last[2] as number) - (first[2] as number))];
        /** At a row: the piece's row, the page's y, and the scale and shift from the piece's x to the page's. */
        const row = (t: number): number[] => {
          const [n, p] = [across(nominal, t), across(camera, t)] as [number[], number[]];
          const scale = ((p[1] as number) - (p[0] as number)) / (kx * ((n[1] as number) - (n[0] as number)));
          return [
            ky * ((n[2] as number) - (first[2] as number)),
            p[2] as number,
            scale,
            (p[0] as number) - scale * kx * ((n[0] as number) - leftmost),
          ];
        };
        const count = Math.min(32, Math.ceil(Math.abs((row(1)[2] as number) - (row(0)[2] as number)) * wide) || 1);
        for (let band = 0; band < count; band++) {
          const [[ty0, y0, a0, b0], [ty1, y1, a1, b1]] = [row(band / count), row((band + 1) / count)] as [
            [number, number, number, number],
            [number, number, number, number],
          ];
          const [high, scale, middle] = [ty1 - ty0, (a0 + a1) / 2, wide / 2];
          bands.push({
            from: ty0,
            // A row more than its own, under the next band: no seam between them.
            high: high + (band < count - 1 ? 1 : 0),
            matrix: [scale, 0, (b1 - b0 + (a1 - a0) * middle) / high, (y1 - y0) / high, b0 + (a0 - scale) * middle, y0],
          });
        }
      }
      const made = field(outline, lines, across, width, height, id, tile[2] ? { tile, bands } : undefined);
      // Not of the drawing: between it and a drawing that goes on after it.
      svg += made[1] === 'i' ? `</svg>${made}${head}` : made;
      return '';
    }
    let frame: string;
    let stop = (): string => `stop-color="${colour()}"`;
    if (kind < 2) {
      const [x1, y1] = camera.project(point());
      const [x2, y2] = camera.project(point());
      frame = `linearGradient x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
    } else {
      // A circle of the room on the plane across an axis: an ellipse here.
      const centre = point();
      const radius = next() * UNIT * grow;
      const axis = next();
      const [cx, cy] = camera.project(centre);
      const edge = (along: number): number[] => {
        const to: [number, number, number] = [...centre];
        to[(axis + along) % 3] = (centre[(axis + along) % 3] as number) + radius;
        const [x, y] = camera.project(to);
        return [x - cx, y - cy];
      };
      frame = `radialGradient cx="0" cy="0" r="1" gradientTransform="matrix(${[...edge(1), ...edge(2), cx, cy]})"`;
    }
    let count = next();
    // An odd count: a glow, each stop with its strength, which falls outwards; its stops are closer together in the middle.
    const glow = count & 1;
    if (glow) stop = () => `stop-color="${colour()}" stop-opacity="${next() / 100}"`;
    count >>= 1;
    svg += `<${frame} id="${id}" gradientUnits="userSpaceOnUse">`;
    for (let i = 0; i < count; i++) svg += `<stop offset="${(i / (count - 1)) ** (1 + glow)}" ${stop()}/>`;
    svg += `</${frame.split(' ')[0]}>`;
    return `url(#${id})`;
  };

  const shapes = next();
  // The last shapes are the page's to show (index.html): from the first of these on, a group, what the set shows whenever
  // it is on; from the second on, a second drawing, what its picture lights.
  const on = next();
  const tube = next();
  let open = '';
  /** Each shape's outlines, for the light along the edge of one. */
  const outlines: string[] = [];
  /** The outline the next shape is to take for its own, where there is one. */
  let other = '';
  for (let shape = 0; shape < shapes; shape++) {
    if (shape === on) {
      svg += '<g class="o">';
      open = '</g>';
    }
    if (shape === tube) {
      // A drawing of its own over the first: the picture's colour changes many times a second, and only this is drawn again.
      svg += `${open}</svg>${head.replace(' ', ' class="t" ')}`;
      open = '';
    }
    // The kind, and eight more for a shape drawn only until the still's image is in (index.html › .v).
    const coded = next();
    const kind = coded & 7;
    // Sixteen more: only an outline, which the next shape takes for its own in a window whose eye is this near.
    const nearer = coded & 16 ? camera.eye[2] > signed() / 1e3 : null;
    let elements: string[] = [];
    if (!kind) {
      // Closed outlines: each a first point and steps from one point to the next, at one depth where it says so.
      let outline = '';
      for (let loops = next(); loops > 0; loops--) {
        const count = next();
        const form = next();
        const twice = 1 << ((form >> 1) & 3);
        let [x, y, z] = [signed(), signed(), signed()];
        const points: [number, number][] = [];
        for (let i = 0; i < count; i++) {
          if (i) {
            if (!(form & 1)) x += signed();
            y += signed();
            z += signed();
          }
          points.push(camera.project([x * DEPTH * twice, y * UNIT * twice, z * UNIT * twice]));
        }
        // A polygon's corners; or a curve's control points: from the middle of each side to the middle of the
        // next, bent towards the corner between them (a point given twice is a sharp corner).
        points.forEach(([px1, py1], i) => {
          const [px2, py2] = points[(i + 1) % count] as [number, number];
          const [px0, py0] = points[(i + count - 1) % count] as [number, number];
          outline +=
            form & 8
              ? `${i ? '' : `M${px((px0 + px1) / 2)} ${px((py0 + py1) / 2)}`}Q${px(px1)} ${px(py1)} ${px((px1 + px2) / 2)} ${px((py1 + py2) / 2)}`
              : `${i ? 'L' : 'M'}${px(px1)} ${px(py1)}`;
        });
        outline += 'Z';
      }
      // An outline from a nearer eye came before this shape: its own in such a window.
      if (nearer === null && other) outline = other;
      other = nearer ? outline : '';
      outlines[shape] = outline;
      elements = [`<path d="${outline}"`];
    } else if (kind === 4) {
      // The finish's vignette: black over the page, more of it the further from the middle, but over one shape.
      const stretch = next() / 100;
      const end = Math.sqrt(next() / 100);
      const except = outlines[next()];
      const count = next();
      svg += `<radialGradient id="stillv" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${end}" gradientTransform="matrix(${[width / 2 / stretch, 0, 0, height / 2, width / 2, height / 2]})">`;
      for (let i = 0; i < count; i++) svg += `<stop offset="${i / (count - 1)}" stop-opacity="${next() / 1e3}"/>`;
      svg += `</radialGradient><path d="M0 0H${width}V${height}H0Z${except}" fill="url(#stillv)"/>`;
    } else {
      const centre = point();
      const size = next() * UNIT;
      const [x, y] = camera.project(centre);
      // A length at the centre's depth, in px: from a point that far above it.
      // A lamp's bloom is the finish's: so many of the room's buffer pixels wide, whatever the window. It is given
      // as it is in the nominal view, and is here as many buffer pixels.
      const above: Point = [centre[0], centre[1] + size, centre[2]];
      const reach = (view: typeof camera): number =>
        (view.project(centre)[1] as number) - (view.project(above)[1] as number);
      grow = kind > 4 ? Math.sqrt((reach(nominal) * NOMINAL_RATIO) / (reach(camera) * ratio)) : 1;
      const span = px(reach(camera) * grow);
      if (kind === 3) {
        // The picture's light along an edge, falling away from it: lines along the edge, each wider and fainter than
        // the last, cut to a shape. The edge is a shape's outline, or (0) the picture's own, and then the light is
        // outside the picture.
        const along = next();
        const [left, top, wide, high] = camera.picture;
        const [rx, ry] = [wide * 0.012, high * 0.016];
        /** The picture's outline, its corners rounded as the page rounds its picture's, this far outside it. */
        const round = (out: number): string => {
          const [x, y] = [rx + out, ry + out];
          return `M${left + rx} ${top - out}h${wide - 2 * rx}a${x} ${y} 0 0 1 ${x} ${y}v${high - 2 * ry}a${x} ${y} 0 0 1 ${-x} ${y}h${2 * rx - wide}a${x} ${y} 0 0 1 ${-x} ${-y}v${2 * ry - high}a${x} ${y} 0 0 1 ${x} ${-y}Z`;
        };
        const frame = round(0);
        const edge = along ? outlines[along] : frame;
        const id = `still${gradients++}`;
        // (Cut a little outside the picture's own outline: the page's picture has that outline too, and a hair of
        // the light would show between the two at its corners.)
        svg += `<clipPath id="${id}"><path clip-rule="evenodd" d="${outlines[next()]}${along ? '' : round(0.8)}"/></clipPath><g clip-path="url(#${id})" fill="none" stroke="currentColor" stroke-linejoin="round">`;
        const lines = next();
        for (let line = 1; line <= lines; line++)
          svg += `<path d="${edge}" stroke-width="${(2 * span * line) / lines}" stroke-opacity="${next() / 100}"/>`;
        svg += '</g>';
      } else if (kind === 2) {
        // A row of the set's print: its first word here, the rest each a step along the face from the last.
        let z = centre[2];
        for (let words = next(); words > 0; words--) {
          elements.push(
            `<text x="${px(camera.project([centre[0], centre[1], z])[0])}" y="${px(y)}" font-size="${span}">${texts[text++]}</text`,
          );
          z += signed() * UNIT;
        }
        // Off the page, a disc is not drawn at all: a lamp's bloom is there only while the lamp is in the window.
      } else if (x > 0 && x < width && y > 0 && y < height)
        elements = [`<circle cx="${px(x)}" cy="${px(y)}" r="${span}"`];
    }
    for (let paints = next(); paints > 0; paints--) {
      // The paint first: a gradient writes its own element before the shape's.
      const fill = paint(outlines[shape] as string);
      if (fill)
        for (const element of elements)
          svg +=
            element.replace(/<\w+/, `$&${coded & 8 ? ' class="v"' : ''} fill="${fill}"`) + (kind === 2 ? '>' : '/>');
    }
  }
  // A drawing left empty between two fields is not one.
  return { svg: `${svg}${open}</svg>`.replace(/<svg[^>]*><\/svg>/g, ''), picture: camera.picture };
}
