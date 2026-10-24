/**
 * A disc's print at the room's label size (SPEC §9.3): the album's own print, or its cover
 * filling the disc, then the rim text every pressed CD carries, set on an arc round the
 * top. A disc whose art did not load is painted a plain colour from its id, still with
 * its text. The canvas's alpha is ink coverage: where it is clear the room shows foil.
 */

export interface LabelText {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly placeholder?: boolean;
}

export type LabelArt =
  /** A print made for the disc: drawn as it is, transparency and all. */
  | { readonly kind: 'print'; readonly image: CanvasImageSource }
  /** The cover: it fills the whole disc. */
  | { readonly kind: 'cover'; readonly image: CanvasImageSource }
  | null;

/** The disc is 120 mm across and fills the label square. */
const DISC_MM = 120;
/** The rim text's centre line and cap height, in mm from the disc's centre. */
const RIM_RADIUS_MM = 54.5;
const CAP_HEIGHT_MM = 3.2;
const STROKE_MM = 0.4;
/** Cap height of the font stack's capitals as a share of its size. */
const CAP_RATIO = 0.72;
/** The text never wraps further than this share of the circle. */
const MAX_ARC = 0.8;
const FONT_STACK = '"Trebuchet MS", "Helvetica Neue", Arial, sans-serif';

/** Paints the print for `album` into `context`, which is `size` px square. */
export function paintDiscLabel(context: CanvasRenderingContext2D, size: number, art: LabelArt, album: LabelText): void {
  const centre = size / 2;
  const mm = size / DISC_MM;
  context.clearRect(0, 0, size, size);
  context.save();
  if (art?.kind === 'print') {
    context.drawImage(art.image, 0, 0, size, size);
  } else {
    context.beginPath();
    context.arc(centre, centre, centre, 0, Math.PI * 2);
    context.clip();
    if (art) context.drawImage(art.image, 0, 0, size, size);
    else {
      context.fillStyle = fallbackColour(album.id);
      context.fillRect(0, 0, size, size);
    }
  }
  context.restore();
  paintRimText(context, centre, mm, rimText(album));
}

/** "NIGHT SHIFT · STUDIO ATTIC". (A placeholder says so in its caption, not on every disc.) */
export function rimText(album: LabelText): string {
  return [album.title, album.artist].join(' · ').toUpperCase();
}

/** A muted, mid-dark colour that is the same for the same id, for discs without art. */
export function fallbackColour(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return `hsl(${(hash >>> 0) % 360} 42% 34%)`;
}

function paintRimText(context: CanvasRenderingContext2D, centre: number, mm: number, text: string): void {
  const radius = RIM_RADIUS_MM * mm;
  let fontSize = (CAP_HEIGHT_MM * mm) / CAP_RATIO;
  context.font = `bold ${fontSize}px ${FONT_STACK}`;
  const characters = [...text];
  let widths = characters.map((character) => context.measureText(character).width);
  let arc = widths.reduce((sum, width) => sum + width, 0) / radius;
  if (arc > Math.PI * 2 * MAX_ARC) {
    // A very long title: smaller letters rather than a ring that meets itself.
    const shrink = (Math.PI * 2 * MAX_ARC) / arc;
    fontSize *= shrink;
    context.font = `bold ${fontSize}px ${FONT_STACK}`;
    widths = widths.map((width) => width * shrink);
    arc *= shrink;
  }
  context.save();
  context.translate(centre, centre);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = STROKE_MM * mm;
  context.strokeStyle = 'rgb(0 0 0 / 0.45)';
  context.fillStyle = 'rgb(244 241 234 / 0.92)';
  // Centred on the top of the disc, reading left to right along the rim.
  let angle = -Math.PI / 2 - arc / 2;
  characters.forEach((character, index) => {
    const step = (widths[index] ?? 0) / radius;
    context.save();
    context.rotate(angle + step / 2 + Math.PI / 2);
    context.strokeText(character, 0, -radius);
    context.fillText(character, 0, -radius);
    context.restore();
    angle += step;
  });
  context.restore();
}
