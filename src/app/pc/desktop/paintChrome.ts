import { ART_SHADOW, type Art, type LinearPaint, type Paint } from './art';
import {
  type DesktopLayout,
  ICON_LABEL_LINE_HEIGHT,
  ICON_LABEL_MAX_LINES,
  ICON_LABEL_WIDTH,
  type Rect,
} from './desktopLayout';
import { DESKTOP_ICON_ART, START_MARK } from './icons';
import {
  DESKTOP_TEXT,
  type GradientStop,
  LABEL_FONT,
  LABEL_SHADOW,
  LABEL_SIZE,
  START_FONT,
  START_RADIUS,
  START_SHADOW,
  START_SIZE,
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
      const box = { y: icon.labelBox.y + index * ICON_LABEL_LINE_HEIGHT, height: ICON_LABEL_LINE_HEIGHT };
      fillShadowedText(
        context,
        line,
        icon.labelBox.x + icon.labelBox.width / 2,
        box,
        LABEL_SIZE,
        'center',
        LABEL_SHADOW,
      );
    });
  }
}

export function paintTaskbar(context: CanvasRenderingContext2D, layout: DesktopLayout, clock: string): void {
  const { taskbar, start, tray } = layout;
  context.fillStyle = paintStyle(context, verticalPaint(taskbar, TASKBAR_STOPS));
  context.fillRect(taskbar.x, taskbar.y, taskbar.width, taskbar.height);
  context.fillStyle = paintStyle(context, verticalPaint(start, START_STOPS));
  context.fill(startButton(start));
  paintArt(context, START_MARK, layout.startMark);
  context.font = START_FONT;
  fillShadowedText(context, 'start', layout.startTextX, start, START_SIZE, 'left', START_SHADOW);

  context.fillStyle = paintStyle(context, verticalPaint(tray, TRAY_STOPS));
  context.fillRect(tray.x, tray.y, tray.width, tray.height);
  context.fillStyle = TRAY_EDGE_DARK;
  context.fillRect(tray.x, tray.y, 1, tray.height);
  context.fillStyle = TRAY_EDGE_LIGHT;
  context.fillRect(tray.x + 1, tray.y, 1, tray.height);
  context.font = LABEL_FONT;
  fillShadowedText(context, clock, tray.x + tray.width / 2, tray, LABEL_SIZE, 'center', null);
}

/** The start button: square on the left, a round end on the right (CSS `border-radius: 0 14px 14px 0`). */
function startButton({ x, y, width, height }: Rect): Path2D {
  const r = START_RADIUS;
  return new Path2D(
    `M${x} ${y}h${width - r}a${r} ${r} 0 0 1 ${r} ${r}v${height - 2 * r}a${r} ${r} 0 0 1-${r} ${r}H${x}z`,
  );
}

/** Draws `art` scaled into `rect`. */
export function paintArt(context: CanvasRenderingContext2D, art: Art, rect: Rect): void {
  context.save();
  context.translate(rect.x, rect.y);
  context.scale(rect.width / art.size, rect.height / art.size);
  for (const part of art.parts) {
    // Parsing a few dozen short paths is cheap next to a repaint that happens a handful of times per visit.
    const path = new Path2D(part.d);
    if (part.shadow) {
      context.save();
      context.translate(ART_SHADOW.x, ART_SHADOW.y);
      context.fillStyle = ART_SHADOW.color;
      context.fill(path);
      context.restore();
    }
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

/** A token's stop array as a vertical gradient over `rect`. */
function verticalPaint(rect: Rect, stops: readonly GradientStop[]): LinearPaint {
  return { x1: 0, y1: rect.y, x2: 0, y2: rect.y + rect.height, stops };
}

function paintStyle(context: CanvasRenderingContext2D, paint: Paint): string | CanvasGradient {
  if (typeof paint === 'string') return paint;
  const gradient = context.createLinearGradient(paint.x1, paint.y1, paint.x2, paint.y2);
  for (const stop of paint.stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

/**
 * White text of `size` px on the CSS half-leading baseline of the line box
 * `line` (its top and height), with an optional hard 1 px shadow drawn as an
 * offset copy (canvas shadow offsets ignore the transform; CSS text-shadow
 * does not).
 */
function fillShadowedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  line: { readonly y: number; readonly height: number },
  size: number,
  align: CanvasTextAlign,
  shadow: string | null,
): void {
  const metrics = context.measureText(text);
  // Engines without the font box metrics (Firefox before 116) get a sans-serif's usual proportions.
  const ascent = metrics.fontBoundingBoxAscent ?? size;
  const descent = metrics.fontBoundingBoxDescent ?? size * 0.22;
  const baseline = line.y + baselineInLineBox(line.height, ascent, descent);
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  if (shadow) {
    context.fillStyle = shadow;
    context.fillText(text, x + 1, baseline + 1);
  }
  context.fillStyle = DESKTOP_TEXT;
  context.fillText(text, x, baseline);
}
