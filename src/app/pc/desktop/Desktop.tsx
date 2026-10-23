import { useLayoutEffect, useMemo, useRef } from 'react';
import { READER_MARK } from '../reader/marks';
import { ArtSvg } from './ArtSvg';
import type { Art } from './art';
import { cssGradient } from './cssGradient';
import {
  type DesktopIconSlot,
  type DesktopLayout,
  ICON_LABEL_LINE_HEIGHT,
  ICON_LABEL_MAX_LINES,
  ICON_LABEL_WIDTH,
  type Rect,
} from './desktopLayout';
import { DESKTOP_ICON_ART, START_MARK } from './icons';
import {
  LABEL_FONT,
  SELECTION,
  START_STOPS,
  TASKBAR_STOPS,
  TRAY_EDGE_DARK,
  TRAY_EDGE_LIGHT,
  TRAY_STOPS,
} from './lunaTokens';
import { wrapLabel } from './text';
import { wallpaperCanvas } from './wallpaper';
import './Desktop.css';

export interface DesktopProps {
  readonly layout: DesktopLayout;
  /** The CV icon is selected (the scripted double-click's first click). */
  readonly selected: boolean;
  /** The open window's title, for its pressed taskbar button; null while no window is open. */
  readonly taskTitle: string | null;
  readonly clock: string;
  /** Device pixels per layout px, for the wallpaper's sharpness. */
  readonly pixelsPerLayoutPx: number;
}

/**
 * The live desktop: the DOM twin of the still painter (`paintChrome.ts`),
 * positioned from the same `desktopLayout` and coloured from the same tokens,
 * over the very same wallpaper canvas. Decorative; the reader is the content.
 */
export function Desktop({ layout, selected, taskTitle, clock, pixelsPerLayoutPx }: DesktopProps) {
  const { taskbar, start, tray } = layout;
  return (
    <div className="pc-desktop" aria-hidden="true">
      <Wallpaper width={layout.width} height={layout.height} pixelsPerLayoutPx={pixelsPerLayoutPx} />
      {layout.icons.map((icon) => (
        <DesktopIcon key={icon.id} icon={icon} selected={selected && icon.id === 'cv'} />
      ))}
      <div className="pc-taskbar" style={{ ...box(taskbar), background: cssGradient('to bottom', TASKBAR_STOPS) }}>
        <div className="pc-start" style={{ ...box(start, taskbar), background: cssGradient('to bottom', START_STOPS) }}>
          <ArtSvg className="pc-start__mark" art={START_MARK} size={16} style={box(layout.startMark, start)} />
          <span className="pc-start__label" style={{ left: layout.startTextX }}>
            start
          </span>
        </div>
        {taskTitle ? (
          <div className="pc-task" style={box(layout.taskButton, taskbar)}>
            <ArtSvg className="pc-task__mark" art={READER_MARK} size={16} />
            <span className="pc-task__label">{taskTitle}</span>
          </div>
        ) : null}
        <div className="pc-tray" style={{ ...box(tray, taskbar), backgroundImage: trayBackground }}>
          {clock}
        </div>
      </div>
    </div>
  );
}

/** The tray's bevelled left edge (dark, then light) over its gradient, like the painter's two 1 px lines. */
const trayBackground = `linear-gradient(to right, ${TRAY_EDGE_DARK} 0 1px, ${TRAY_EDGE_LIGHT} 1px 2px, transparent 2px), ${cssGradient('to bottom', TRAY_STOPS)}`;

function DesktopIcon({ icon, selected }: { readonly icon: DesktopIconSlot; readonly selected: boolean }) {
  const lines = useMemo(() => labelLines(icon.label), [icon.label]);
  const art = DESKTOP_ICON_ART[icon.id];
  return (
    <div className="pc-icon" data-selected={selected} style={box(icon.cell)}>
      <div className="pc-icon__art" style={box(icon.art, icon.cell)}>
        <ArtSvg art={art} size={32} />
        {/* The selected tint: the icon's silhouette in the selection blue at 50 %. */}
        {selected ? <ArtSvg className="pc-icon__tint" art={tinted(art)} size={32} /> : null}
      </div>
      <div className="pc-icon__label" style={box(icon.labelBox, icon.cell)}>
        {lines.map((line) => (
          <span key={line} className="pc-icon__line" style={{ height: ICON_LABEL_LINE_HEIGHT }}>
            <span className="pc-icon__text">{line}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Wallpaper({
  width,
  height,
  pixelsPerLayoutPx,
}: {
  readonly width: number;
  readonly height: number;
  readonly pixelsPerLayoutPx: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const required = Math.ceil(width * Math.min(pixelsPerLayoutPx, 2));
  useLayoutEffect(() => {
    if (!host.current || width <= 0 || height <= 0) return;
    // The same element the still painter draws from: one bitmap for the glass and the live screen.
    const canvas = wallpaperCanvas(required, width / height);
    if (canvas.parentNode !== host.current) host.current.replaceChildren(canvas);
  }, [required, width, height]);
  return <div ref={host} className="pc-desktop__wallpaper" />;
}

/** Inline position and size of `rect`, relative to `parent`. */
function box(rect: Rect, parent: { readonly x: number; readonly y: number } = { x: 0, y: 0 }) {
  return { left: rect.x - parent.x, top: rect.y - parent.y, width: rect.width, height: rect.height };
}

let measuring: CanvasRenderingContext2D | null = null;

/** Breaks a label exactly as the painter does: same font, same measurements, same rule. */
function labelLines(label: string): readonly string[] {
  measuring ??= document.createElement('canvas').getContext('2d');
  const context = measuring;
  if (!context) return [label];
  context.font = LABEL_FONT;
  return wrapLabel(label, ICON_LABEL_WIDTH, ICON_LABEL_MAX_LINES, (text) => context.measureText(text).width);
}

const tints = new WeakMap<Art, Art>();

/** The art's filled shapes, all in the selection blue (shown at 50 % over the icon). */
function tinted(art: Art): Art {
  let tint = tints.get(art);
  if (!tint) {
    const parts = art.parts.flatMap((part) =>
      part.fill ? [{ d: part.d, fill: SELECTION, evenOdd: part.evenOdd }] : [],
    );
    tint = { size: art.size, parts };
    tints.set(art, tint);
  }
  return tint;
}
