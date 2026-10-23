import type { Art, Paint } from './art';
import {
  type DesktopLayout,
  ICON_LABEL_LINE_HEIGHT,
  ICON_LABEL_MAX_LINES,
  ICON_LABEL_WIDTH,
  type Rect,
} from './desktopLayout';
import { DESKTOP_ICON_ART, START_MARK } from './icons';
import {
  CLOCK_FONT,
  DESKTOP_TEXT,
  type GradientStop,
  LABEL_FONT,
  LABEL_SHADOW,
  START_FONT,
  START_RADIUS,
  START_SHADOW,
  START_STOPS,
  TASKBAR_STOPS,
  TRAY_EDGE_DARK,
  TRAY_EDGE_LIGHT,
  TRAY_STOPS,
} from './lunaTokens';
import { baselineInLineBox, wrapLabel } from './text';

/**
 * Paints the desktop's chrome (icons, labels, taskbar, start button, clock)
 * onto a canvas whose transform maps layout px. Every position comes from
 * `desktopLayout` and every colour from `lunaTokens`, exactly as the DOM
 * desktop renders them.
 */

export function paintIcons(context: CanvasRenderingContext2D, layout: DesktopLayout): void {
  context.font = LABEL_FONT;
  const measure = (text: string): number => context.measureText(text).width;
  for (const icon of layout.icons) {
    paintArt(context, DESKTOP_ICON_ART[icon.id], icon.art);
    const lines = wrapLabel(icon.label, ICON_LABEL_WIDTH, ICON_LABEL_MAX_LINES, measure);
    lines.forEach((line, index) => {
      const top = icon.labelBox.y + index * ICON_LABEL_LINE_HEIGHT;
      fillShadowedText(context, line, icon.labelBox.x + icon.labelBox.width / 2, top, ICON_LABEL_LINE_HEIGHT, {
        align: 'center',
        shadow: LABEL_SHADOW,
      });
    });
  }
}

export function paintTaskbar(context: CanvasRenderingContext2D, layout: DesktopLayout, clock: string): void {
  const { taskbar, start, tray } = layout;
  fillVertical(context, taskbar, TASKBAR_STOPS);

  context.save();
  startButtonPath(context, start);
  context.fillStyle = verticalGradient(context, start, START_STOPS);
  context.fill();
  context.restore();
  paintArt(context, START_MARK, layout.startMark);
  context.font = START_FONT;
  fillShadowedText(context, 'start', layout.startTextX, start.y, start.height, { align: 'left', shadow: START_SHADOW });

  fillVertical(context, tray, TRAY_STOPS);
  context.fillStyle = TRAY_EDGE_DARK;
  context.fillRect(tray.x, tray.y, 1, tray.height);
  context.fillStyle = TRAY_EDGE_LIGHT;
  context.fillRect(tray.x + 1, tray.y, 1, tray.height);
  context.font = CLOCK_FONT;
  fillShadowedText(context, clock, tray.x + tray.width / 2, tray.y, tray.height, { align: 'center', shadow: null });
}

/** The start button: square on the left, a 14 px round end on the right (CSS `border-radius: 0 14px 14px 0`). */
function startButtonPath(context: CanvasRenderingContext2D, rect: Rect): void {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  context.beginPath();
  context.moveTo(rect.x, rect.y);
  context.lineTo(right - START_RADIUS, rect.y);
  context.arcTo(right, rect.y, right, rect.y + START_RADIUS, START_RADIUS);
  context.lineTo(right, bottom - START_RADIUS);
  context.arcTo(right, bottom, right - START_RADIUS, bottom, START_RADIUS);
  context.lineTo(rect.x, bottom);
  context.closePath();
}

/** Draws `art` scaled into `rect`. Paths are parsed once and reused for every repaint. */
export function paintArt(context: CanvasRenderingContext2D, art: Art, rect: Rect): void {
  context.save();
  context.translate(rect.x, rect.y);
  context.scale(rect.width / art.size, rect.height / art.size);
  for (const part of art.parts) {
    const path = pathFor(part.d);
    context.globalAlpha = part.opacity ?? 1;
    if (part.fill) {
      context.fillStyle = paintStyle(context, part.fill);
      context.fill(path, part.evenOdd ? 'evenodd' : 'nonzero');
    }
    if (part.stroke) {
      context.strokeStyle = part.stroke;
      context.lineWidth = part.width ?? 1;
      context.stroke(path);
    }
  }
  context.restore();
}

const paths = new Map<string, Path2D>();

function pathFor(d: string): Path2D {
  let path = paths.get(d);
  if (!path) {
    path = new Path2D(d);
    paths.set(d, path);
  }
  return path;
}

function paintStyle(context: CanvasRenderingContext2D, paint: Paint): string | CanvasGradient {
  if (typeof paint === 'string') return paint;
  const gradient = context.createLinearGradient(paint.x1, paint.y1, paint.x2, paint.y2);
  for (const stop of paint.stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

function verticalGradient(context: CanvasRenderingContext2D, rect: Rect, stops: readonly GradientStop[]) {
  const gradient = context.createLinearGradient(0, rect.y, 0, rect.y + rect.height);
  for (const stop of stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

function fillVertical(context: CanvasRenderingContext2D, rect: Rect, stops: readonly GradientStop[]): void {
  context.fillStyle = verticalGradient(context, rect, stops);
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
}

/**
 * White text on the CSS half-leading baseline of a `lineHeight` line box
 * starting at `lineTop`, with an optional hard 1 px shadow drawn as an offset
 * copy (canvas shadow offsets ignore the transform, CSS text-shadow does not).
 */
function fillShadowedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  lineTop: number,
  lineHeight: number,
  { align, shadow }: { readonly align: CanvasTextAlign; readonly shadow: string | null },
): void {
  const metrics = context.measureText(text);
  const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(context.font)?.[1] ?? '11');
  // Older engines lack the font box metrics; these fallbacks are typical sans-serif proportions.
  const ascent = metrics.fontBoundingBoxAscent ?? size * 0.9;
  const descent = metrics.fontBoundingBoxDescent ?? size * 0.22;
  const baseline = lineTop + baselineInLineBox(lineHeight, ascent, descent);
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  if (shadow) {
    context.fillStyle = shadow;
    context.fillText(text, x + 1, baseline + 1);
  }
  context.fillStyle = DESKTOP_TEXT;
  context.fillText(text, x, baseline);
}
