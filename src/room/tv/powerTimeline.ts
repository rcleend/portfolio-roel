import { easeInCubic, easeOutBack, easeOutCubic, easeOutExpo, segment } from '../motion/easing';

/**
 * The CRT power animation as a pure function of elapsed time, so the shader uniforms for any
 * moment can be computed (and tested) without a renderer.
 */
export type PowerState = 'off' | 'powering-on' | 'on' | 'powering-off';

export interface CrtPowerFrame {
  /** Horizontal / vertical deflection: the picture is squeezed into this fraction of the glass. */
  readonly scaleX: number;
  readonly scaleY: number;
  /** Picture brightness multiplier; > 1 is the overdriven beam during power transitions. */
  readonly brightness: number;
  /** 0–1 mix towards a flat white raster, the beam before the picture locks in. */
  readonly flash: number;
  /** Vertical picture offset as a fraction of the picture height (rolling hold). */
  readonly roll: number;
  /** 0–1 overall light output, used for the light the screen spills into the room. */
  readonly lit: number;
}

export const POWER_ON_MS = 600;
export const POWER_OFF_MS = 420;
/** Under prefers-reduced-motion the tube simply fades, without the dot/line choreography. */
export const REDUCED_POWER_MS = 160;

/** Size of the beam's "dot" phase, as a fraction of the glass. */
const DOT = 0.012;
const LINE_HEIGHT = 0.02;

const OFF: CrtPowerFrame = { scaleX: 0, scaleY: 0, brightness: 0, flash: 0, roll: 0, lit: 0 };
const ON: CrtPowerFrame = { scaleX: 1, scaleY: 1, brightness: 1, flash: 0, roll: 0, lit: 1 };

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const overshoot = easeOutBack(2.2);

function frame(scaleX: number, scaleY: number, brightness: number, flash: number, roll: number): CrtPowerFrame {
  // Light output follows lit area, but a hot dot still reads as a light source.
  const area = Math.sqrt(Math.max(0, scaleX * scaleY));
  return { scaleX, scaleY, brightness, flash, roll, lit: Math.min(1, area * brightness) };
}

export function powerDurationMs(state: PowerState, reducedMotion: boolean): number {
  if (state === 'powering-on') return reducedMotion ? REDUCED_POWER_MS : POWER_ON_MS;
  if (state === 'powering-off') return reducedMotion ? REDUCED_POWER_MS : POWER_OFF_MS;
  return 0;
}

export function crtPowerFrame(state: PowerState, elapsedMs: number, reducedMotion: boolean): CrtPowerFrame {
  switch (state) {
    case 'off':
      return OFF;
    case 'on':
      return ON;
    case 'powering-on':
      return reducedMotion ? fade(elapsedMs / REDUCED_POWER_MS) : powerOn(elapsedMs);
    case 'powering-off':
      return reducedMotion ? fade(1 - elapsedMs / REDUCED_POWER_MS) : powerOff(elapsedMs);
  }
}

function fade(level: number): CrtPowerFrame {
  const b = Math.min(1, Math.max(0, level));
  return frame(1, 1, b, 0, 0);
}

/** Dot → horizontal line → vertical snap open with overshoot → bloom settles with a short roll. */
function powerOn(t: number): CrtPowerFrame {
  if (t >= POWER_ON_MS) return ON;
  const dot = segment(t, 0, 90, easeOutCubic);
  const line = segment(t, 90, 230, easeOutExpo);
  const open = segment(t, 230, 430, overshoot);
  const scaleX = mix(DOT, 1, line);
  const scaleY = t < 230 ? mix(DOT, LINE_HEIGHT, line) : mix(LINE_HEIGHT, 1, open);
  const flash = 1 - segment(t, 250, 400, easeOutCubic);
  const brightness =
    t < 230 ? mix(0, 2.4, dot) : mix(2.4, 1.35, segment(t, 230, 400)) - 0.35 * segment(t, 400, 600, easeOutCubic);
  const roll = 0.1 * (1 - segment(t, 300, 580, easeOutCubic)) * (t >= 300 ? 1 : 0);
  return frame(scaleX, scaleY, brightness, flash, roll);
}

/** Picture collapses to a white line, the line to a dot, and the dot fades out. */
function powerOff(t: number): CrtPowerFrame {
  if (t >= POWER_OFF_MS) return OFF;
  const collapse = segment(t, 0, 140, easeInCubic);
  const shrink = segment(t, 140, 260, easeInCubic);
  const fadeOut = segment(t, 260, POWER_OFF_MS, easeOutCubic);
  const scaleY = mix(1, LINE_HEIGHT * 0.4, collapse);
  const scaleX = mix(1, DOT, shrink);
  const brightness = mix(1, 2.2, collapse) * (1 - fadeOut);
  return frame(scaleX, scaleY, brightness, collapse, 0);
}
