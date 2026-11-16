import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { onCanvasRestored } from '../../stage/canvasRestore';
import type { LcdReadout } from '../RadioDeck';
import { BLANK, type LcdFrame, lcdFrame, SEGMENT, sameFrame } from './lcdSegments';

/** The LCD's rectangle on the dial glass, in world metres (gen/props/radioSpec.ts › lcd). */
export interface LcdPlacement {
  readonly min: readonly [number, number];
  readonly max: readonly [number, number];
  /** The glass's z at the rectangle's centre, and the glass's normal (it leans back with the dial). */
  readonly z: number;
  readonly normal: readonly [number, number, number];
}

/** *Tunable* 0.6–1.0: how bright the backlight reads against the baked panel at night. */
export const LCD_BRIGHTNESS = 0.85;
/** The quad floats this far in front of the glass. */
const LIFT = 0.0003;
/** Warm-up flicker of the backlight: [ms, level] keyframes. */
const WARM_UP: readonly (readonly [number, number])[] = [
  [0, 0],
  [40, 0.4],
  [70, 0.1],
  [120, 0.7],
  [200, 1],
];
const FADE_OUT_MS = 300;
const BACKLIGHT = '#c4ecd0';
const VIGNETTE = '#93c8a4';
const INK = '#15261c';
const GHOST = 0.07;
/** Segments lean like the device's own italics. */
const SLANT = Math.tan((7 * Math.PI) / 180);

/** Canvas size for the LCD: 256 × 72, or 512 × 144 when the display lands wider than 140 render px. */
export function lcdCanvasSize(renderWidth: number): { width: number; height: number } {
  return renderWidth > 140 ? { width: 512, height: 144 } : { width: 256, height: 72 };
}

/** The backlight level `elapsed` ms into the warm-up flicker. */
export function warmUpLevel(elapsed: number): number {
  for (let i = 1; i < WARM_UP.length; i++) {
    const [t1, l1] = WARM_UP[i] as readonly [number, number];
    const [t0, l0] = WARM_UP[i - 1] as readonly [number, number];
    if (elapsed <= t1) return l0 + ((l1 - l0) * Math.max(0, elapsed - t0)) / (t1 - t0);
  }
  return 1;
}

/**
 * The radio's display: a quad over the original model's LCD with a `MeshBasicMaterial` + `map` (the baked
 * surfaces' own program, so it adds none), painted on a canvas only when what it shows changes. Hidden while off,
 * so the baked panel shows through.
 */
export class Lcd {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly #canvas = document.createElement('canvas');
  readonly #texture: CanvasTexture;
  #shown: LcdFrame = BLANK;
  #level = 0;
  #stopFade: (() => void) | null = null;
  #lit = false;
  readonly #stopRestore: () => void;

  constructor(
    parent: Object3D,
    placement: LcdPlacement,
    renderWidth: number,
    anisotropy: number,
    private readonly loop: { animate(step: (now: number) => boolean): () => void; invalidate(): void },
  ) {
    const size = lcdCanvasSize(renderWidth);
    this.#canvas.width = size.width;
    this.#canvas.height = size.height;
    this.#texture = new CanvasTexture(this.#canvas);
    this.#texture.colorSpace = SRGBColorSpace;
    this.#texture.minFilter = LinearMipmapLinearFilter;
    this.#texture.magFilter = LinearFilter;
    this.#texture.anisotropy = anisotropy;
    this.mesh = new Mesh(lcdQuad(placement), new MeshBasicMaterial({ map: this.#texture }));
    this.mesh.name = 'RadioLcd';
    // Its colour is its brightness, set here alone: the prop's spotlight leaves it be (Spotlight › liftable). Stored
    // while the display was off and written back as the light faded, it left a display lit by a cut black for good.
    this.mesh.userData.ownColour = true;
    this.mesh.visible = false;
    this.#applyLevel(0);
    parent.add(this.mesh);
    // What an empty radio greets the visitor with, painted now (the device is made in idle time) rather than in the
    // click that sends the camera to the radio; it stays hidden until the display lights.
    this.#shown = lcdFrame({ kind: 'no-disc' });
    this.#paint(this.#shown);
    // A GPU process reset gives the canvas back blank, and the display read black until its readout next changed
    // (never, at an empty radio): the readout is painted again, and the upload follows.
    this.#stopRestore = onCanvasRestored(this.#canvas, () => {
      this.#paint(this.#shown);
      this.loop.invalidate();
    });
  }

  /** Pixels on the GPU (with mips). */
  get pixels(): number {
    return this.#canvas.width * this.#canvas.height;
  }

  /** Shows `readout`; `blinkOn` false hides a paused time. Returns true if anything visible changed. */
  show(readout: LcdReadout, blinkOn: boolean, reducedMotion: boolean): boolean {
    const on = readout.kind !== 'off';
    let changed = false;
    if (on !== this.#lit) {
      this.#lit = on;
      changed = true;
      if (on) this.#warmUp(reducedMotion);
      else this.#fadeOut(reducedMotion);
    }
    const frame = on ? lcdFrame(readout, blinkOn) : this.#shown;
    if (!sameFrame(frame, this.#shown) || (on && this.#texture.version === 0)) {
      this.#shown = frame;
      this.#paint(frame);
      changed = true;
    }
    if (changed) this.loop.invalidate();
    return changed;
  }

  dispose(): void {
    this.#stopRestore();
    this.#stopFade?.();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.#texture.dispose();
    this.#canvas.width = this.#canvas.height = 0;
  }

  #warmUp(reducedMotion: boolean): void {
    this.#stopFade?.();
    this.mesh.visible = true;
    if (reducedMotion) {
      this.#applyLevel(1);
      return;
    }
    let start: number | null = null;
    this.#stopFade = this.loop.animate((now) => {
      start ??= now;
      const level = warmUpLevel(now - start);
      this.#applyLevel(level);
      return level < 1;
    });
  }

  #fadeOut(reducedMotion: boolean): void {
    this.#stopFade?.();
    if (reducedMotion) {
      this.#applyLevel(0);
      this.mesh.visible = false;
      return;
    }
    const from = this.#level;
    let start: number | null = null;
    this.#stopFade = this.loop.animate((now) => {
      start ??= now;
      const u = Math.min(1, (now - start) / FADE_OUT_MS);
      this.#applyLevel(from * (1 - u));
      if (u < 1) return true;
      this.mesh.visible = false;
      return false;
    });
  }

  #applyLevel(level: number): void {
    this.#level = level;
    this.mesh.material.color.setScalar(LCD_BRIGHTNESS * level);
  }

  #paint(frame: LcdFrame): void {
    const context = this.#canvas.getContext('2d');
    if (!context) return;
    const { width: w, height: h } = this.#canvas;
    const glow = context.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.62);
    glow.addColorStop(0, BACKLIGHT);
    glow.addColorStop(1, VIGNETTE);
    context.fillStyle = glow;
    context.fillRect(0, 0, w, h);
    const digitHeight = h * 0.62;
    const digitWidth = digitHeight * 0.52;
    const stroke = digitHeight * 0.11;
    const top = (h - digitHeight) / 2;
    // Icon cell, two track digits, a gap, then mm:ss.
    const x0 = w * 0.06;
    const iconWidth = digitWidth * 0.8;
    const pitch = digitWidth * 1.32;
    const trackX = x0 + iconWidth + pitch * 0.45;
    const timeX = trackX + pitch * 2 + pitch * 0.55;
    const cellX = [trackX, trackX + pitch, timeX, timeX + pitch, timeX + pitch * 2.45, timeX + pitch * 3.45];
    for (const ghost of [true, false]) {
      context.fillStyle = INK;
      context.globalAlpha = ghost ? GHOST : 1;
      frame.cells.forEach((lit, i) => {
        drawDigit(context, cellX[i] ?? 0, top, digitWidth, digitHeight, stroke, ghost ? 0x7f : lit);
      });
      if (ghost || frame.colon) {
        const cx = timeX + pitch * 2 + digitWidth * 0.25;
        for (const fy of [0.32, 0.72]) {
          const y = top + digitHeight * fy;
          context.fillRect(cx - (y - top - digitHeight / 2) * SLANT, y - stroke / 2, stroke, stroke);
        }
      }
      if (ghost || frame.icon === 'play') drawPlay(context, x0, top + digitHeight * 0.2, iconWidth, digitHeight * 0.6);
      if (ghost || frame.icon === 'pause')
        drawPause(context, x0, top + digitHeight * 0.2, iconWidth, digitHeight * 0.6);
    }
    context.globalAlpha = 1;
    this.#texture.needsUpdate = true;
  }
}

/** The LCD's quad on the dial's plane, `LIFT` in front of the glass. */
function lcdQuad(placement: LcdPlacement): BufferGeometry {
  const [nx, ny, nz] = placement.normal;
  const cy = (placement.min[1] + placement.max[1]) / 2;
  // The glass leans back: z follows its plane through the centre.
  const zAt = (y: number): number => placement.z - (ny / nz) * (y - cy);
  const lift = new Vector3(nx, ny, nz).normalize().multiplyScalar(LIFT);
  const corners = [
    [placement.min[0], placement.min[1]],
    [placement.max[0], placement.min[1]],
    [placement.max[0], placement.max[1]],
    [placement.min[0], placement.max[1]],
  ].map(([x, y]) => new Vector3(x, y, zAt(y ?? cy)).add(lift));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(corners.flatMap((c) => c.toArray())), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  // Normals only so the quad matches the baked surfaces' program exactly (their meshes all carry them).
  const normal = new Vector3(nx, ny, nz).normalize().toArray();
  geometry.setAttribute(
    'normal',
    new BufferAttribute(new Float32Array([...normal, ...normal, ...normal, ...normal]), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/** One seven-segment digit, slanted, with bevelled bars. */
function drawDigit(
  context: CanvasRenderingContext2D,
  x: number,
  top: number,
  width: number,
  height: number,
  stroke: number,
  segments: number,
): void {
  const half = height / 2;
  const bar = (x1: number, y1: number, x2: number, y2: number) => {
    const horizontal = y1 === y2;
    const inset = stroke * 0.55;
    context.beginPath();
    if (horizontal) {
      const at = (px: number, py: number): [number, number] => [px - (py - top - half) * SLANT, py];
      context.moveTo(...at(x1 + inset, y1));
      context.lineTo(...at(x1 + inset + stroke / 2, y1 - stroke / 2));
      context.lineTo(...at(x2 - inset - stroke / 2, y1 - stroke / 2));
      context.lineTo(...at(x2 - inset, y1));
      context.lineTo(...at(x2 - inset - stroke / 2, y1 + stroke / 2));
      context.lineTo(...at(x1 + inset + stroke / 2, y1 + stroke / 2));
    } else {
      const at = (px: number, py: number): [number, number] => [px - (py - top - half) * SLANT, py];
      context.moveTo(...at(x1, y1 + inset));
      context.lineTo(...at(x1 + stroke / 2, y1 + inset + stroke / 2));
      context.lineTo(...at(x1 + stroke / 2, y2 - inset - stroke / 2));
      context.lineTo(...at(x1, y2 - inset));
      context.lineTo(...at(x1 - stroke / 2, y2 - inset - stroke / 2));
      context.lineTo(...at(x1 - stroke / 2, y1 + inset + stroke / 2));
    }
    context.closePath();
    context.fill();
  };
  const left = x;
  const right = x + width;
  const y0 = top;
  const y1 = top + half;
  const y2 = top + height;
  if (segments & SEGMENT.a) bar(left, y0, right, y0);
  if (segments & SEGMENT.b) bar(right, y0, right, y1);
  if (segments & SEGMENT.c) bar(right, y1, right, y2);
  if (segments & SEGMENT.d) bar(left, y2, right, y2);
  if (segments & SEGMENT.e) bar(left, y1, left, y2);
  if (segments & SEGMENT.f) bar(left, y0, left, y1);
  if (segments & SEGMENT.g) bar(left, y1, right, y1);
}

function drawPlay(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y + height / 2);
  context.lineTo(x, y + height);
  context.closePath();
  context.fill();
}

function drawPause(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  const bar = width * 0.3;
  context.fillRect(x + width * 0.08, y, bar, height);
  context.fillRect(x + width * 0.62, y, bar, height);
}
