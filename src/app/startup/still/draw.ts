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
  const camera = stillCamera(
    { bounds: [fine(), fine()], picture: Array.from({ length: outlined }, fine) },
    width,
    height,
    insets,
  );
  const px = (value: number): number => +value.toFixed(1);
  const colour = (): string => `rgb(${next()},${next()},${next()})`;

  let svg = `<svg width="${width}" height="${height}" fill-rule="evenodd">`;
  let gradients = 0;
  let text = 0;
  const paint = (): string => {
    const kind = next();
    if (!kind) return colour();
    const id = `still${gradients++}`;
    let frame: string;
    let stop = (): string => `stop-color="${colour()}"`;
    if (kind < 2) {
      const [x1, y1] = camera.project(point());
      const [x2, y2] = camera.project(point());
      frame = `linearGradient x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
    } else {
      // A circle of the room on the plane across an axis: an ellipse here.
      const centre = point();
      const radius = next() * UNIT;
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
    // An odd count: a glow, one colour whose strength falls outwards.
    if (count & 1) {
      const glow = colour();
      stop = () => `stop-color="${glow}" stop-opacity="${next() / 100}"`;
    }
    count >>= 1;
    svg += `<${frame} id="${id}" gradientUnits="userSpaceOnUse">`;
    for (let i = 0; i < count; i++) svg += `<stop offset="${i / (count - 1)}" ${stop()}/>`;
    svg += `</${frame.split(' ')[0]}>`;
    return `url(#${id})`;
  };

  const shapes = next();
  // From this shape on, what the set shows only when it is on, in a group the page shows with the game's picture.
  const lit = next();
  /** Each shape's outlines, for the light along the edge of one. */
  const outlines: string[] = [];
  for (let shape = 0; shape < shapes; shape++) {
    if (shape === lit) svg += '<g>';
    const kind = next();
    let elements: string[] = [];
    let ink = 'fill';
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
      outlines[shape] = outline;
      elements = [`<path d="${outline}"`];
    } else {
      const centre = point();
      const size = next() * UNIT;
      const [x, y] = camera.project(centre);
      // A length at the centre's depth, in px: from a point that far above it.
      const span = px(y - (camera.project([centre[0], centre[1] + size, centre[2]])[1] as number));
      if (kind > 2) {
        // The light along the edge of the shape numbered, inside it: half of a line this wide, cut to the shape.
        ink = 'stroke';
        const edge = outlines[next()];
        svg += `<clipPath id="stillc"><path d="${edge}"/></clipPath>`;
        elements = [`<path d="${edge}" clip-path="url(#stillc)" fill="none" stroke-width="${span}"`];
      } else if (kind > 1) {
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
      const fill = paint();
      for (const element of elements) svg += element.replace(/<\w+/, `$& ${ink}="${fill}"`) + (kind === 2 ? '>' : '/>');
    }
  }
  return { svg: `${svg}</g></svg>`, picture: camera.picture };
}
