import { mix } from '@/engine/gfx/color';
import { clamp, lerp } from '@/engine/math/scalar';
import { easeOutQuad, steps } from '@/engine/motion/easing';
import { frames, segment } from '@/engine/motion/progress';
import { palette } from '../../palette';

/**
 * The boot sequence as pure functions of scene time, following the Neo Geo
 * MVS boot frame by frame (docs/ART-DIRECTION.md › Boot). The scene only
 * reads these, so every frame is reproducible and the choreography is
 * testable without a canvas.
 */
export const BOOT_TIMES = {
  /** The mirrored logo has spun in to full width. */
  spinEnd: 0.55,
  /** The background starts greying and the logo starts flipping over. */
  flipStart: 0.8,
  /** Edge-on: the logo is a line and the background mid grey. */
  flipMid: 1.35,
  /** Readable, white, on black. */
  flipEnd: 1.9,
  typeStart: 1.95,
  markStart: 4.0,
  markEnd: 4.4,
  /** Cut to black, then the title. */
  end: 6.4,
} as const;

/** One character every four frames, like the MVS BIOS. */
export const FRAMES_PER_CHAR = 4;
/** How long the screen stays black between the boot and the title. */
export const BLACKOUT_SECONDS = frames(6);

/** First visits must sit through the logo; returning visitors may skip almost at once. */
export const SKIP_FROM = { firstVisit: 4.4, returning: 1.0 } as const;

export const TYPED_LINES = ['LEENDERS', 'PRODUCTION'] as const;

/** The grey the background passes through while the logo is edge-on. */
const MID_GREY = 144;
/** Flat steps per half of the background fade; the MVS palette fade jumps rather than glides. */
const GREY_STEPS = 7;
/** Logo colour levels between background and ink, so the fade reads as palette steps too. */
const CONTRAST_STEPS = 8;
/** Width of the logo on the first frame, as a fraction of its rest width. */
const SPIN_START_WIDTH = 0.04;
/** The logo also zooms in a little while it spins, so the narrow phases look tall and condensed. */
const SPIN_START_HEIGHT = 0.7;

/** "RCL" fades from near-black navy to royal blue, overshooting into cyan for one step. */
export const MARK_COLORS = ['#06063f', '#0a14b4', '#3aaeff', '#2a8cff', palette.royal] as const;
/** The step during which the mark flares and the logo catches a cyan glint. */
const MARK_GLINT_STEP = 2;
const LOGO_GLINT = '#dcf8fc';

export interface LogoPose {
  /** Horizontal scale against the logo's rest width, in (0, 1]. */
  readonly scaleX: number;
  /** Vertical scale against the rest height, in [0, 1]; 0 is edge-on. */
  readonly scaleY: number;
  /** Seen from behind: drawn mirrored left to right. */
  readonly mirrored: boolean;
  readonly color: string;
}

/** Background brightness (0–255): white, stepping to mid grey, then to black. */
export function backgroundGrey(time: number): number {
  const { flipStart, flipMid, flipEnd } = BOOT_TIMES;
  if (time < flipMid) return Math.round(lerp(255, MID_GREY, segment(time, flipStart, flipMid, steps(GREY_STEPS))));
  return Math.round(lerp(MID_GREY, 0, segment(time, flipMid, flipEnd, steps(GREY_STEPS))));
}

export function backgroundColor(time: number): string {
  return grey(backgroundGrey(time));
}

/**
 * Where the logo is in its spin and flip. Before the flip it is the back of
 * the logo (mirrored, black on white); after it, the front (readable, white
 * on black). Its colour converges on the background as it turns edge-on,
 * the way the MVS fades it through the palette.
 */
export function logoPose(time: number): LogoPose {
  const { spinEnd, flipStart, flipMid, flipEnd } = BOOT_TIMES;
  const background = backgroundColor(time);
  if (time < flipMid) {
    const spin = segment(time, 0, spinEnd);
    const scaleY =
      time < flipStart
        ? lerp(SPIN_START_HEIGHT, 1, segment(time, 0, spinEnd, easeOutQuad))
        : 1 - segment(time, flipStart, flipMid);
    return {
      scaleX: lerp(SPIN_START_WIDTH, 1, spin),
      scaleY,
      mirrored: true,
      color: towards(background, palette.black, time < flipStart ? 1 : scaleY),
    };
  }
  const scaleY = segment(time, flipMid, flipEnd, easeOutQuad);
  const color = isGlinting(time) ? LOGO_GLINT : towards(background, palette.white, scaleY);
  return { scaleX: 1, scaleY, mirrored: false, color };
}

/** Characters of each typed line visible at `time`; the line break costs one character's pause. */
export function typedCounts(time: number, lines: readonly string[] = TYPED_LINES): number[] {
  const elapsed = toFrame(time) - toFrame(BOOT_TIMES.typeStart);
  let remaining = elapsed < 0 ? 0 : Math.floor(elapsed / FRAMES_PER_CHAR) + 1;
  return lines.map((line) => {
    const shown = clamp(remaining, 0, line.length);
    remaining -= line.length + 1;
    return shown;
  });
}

/** Characters revealed after `previous` up to and including `time` — one typewriter tick each. */
export function charsTypedBetween(previous: number, time: number, lines: readonly string[] = TYPED_LINES): string[] {
  const before = typedCounts(previous, lines);
  const after = typedCounts(time, lines);
  return lines.flatMap((line, i) => [...line.slice(before[i] ?? 0, after[i] ?? 0)]);
}

/** Colour of the "RCL" mark, or `null` before it appears. */
export function markColor(time: number): string | null {
  if (time < BOOT_TIMES.markStart) return null;
  return MARK_COLORS[markStep(time)] ?? palette.royal;
}

/** When a button press may cut the boot short. */
export function skippableFrom(bootSeen: boolean): number {
  return bootSeen ? SKIP_FROM.returning : SKIP_FROM.firstVisit;
}

function markStep(time: number): number {
  const progress = segment(time, BOOT_TIMES.markStart, BOOT_TIMES.markEnd);
  return Math.min(MARK_COLORS.length - 1, Math.floor(progress * MARK_COLORS.length));
}

function isGlinting(time: number): boolean {
  return time >= BOOT_TIMES.markStart && markStep(time) === MARK_GLINT_STEP;
}

/** `amount` of the way from the background to the ink, in flat steps; any visible logo keeps some contrast. */
function towards(background: string, ink: string, amount: number): string {
  return mix(background, ink, Math.ceil(clamp(amount, 0, 1) * CONTRAST_STEPS) / CONTRAST_STEPS);
}

function grey(value: number): string {
  const hex = value.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

/** Whole 60 Hz frames in `seconds`; scene time is a sum of 1/60 steps, so rounding removes float drift. */
function toFrame(seconds: number): number {
  return Math.round(seconds * 60);
}
