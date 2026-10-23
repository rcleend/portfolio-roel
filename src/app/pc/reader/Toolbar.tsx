import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import { emailLink } from '@/content';
import { ArtSvg } from '../desktop/ArtSvg';
import type { Art } from '../desktop/art';
import {
  EMAIL_GLYPH,
  FIT_WIDTH_GLYPH,
  HAND_GLYPH,
  PRINT_GLYPH,
  REFLOW_GLYPH,
  SAVE_GLYPH,
  SELECT_GLYPH,
  ZOOM_IN_GLYPH,
  ZOOM_OUT_GLYPH,
} from './glyphs';
import { nextRovingIndex } from './roving';
import { parseZoomFieldValue, ZOOM_STEPS, type ZoomSetting, zoomFieldValue } from './zoom';

export interface ToolbarProps {
  readonly zoom: ZoomSetting;
  readonly onZoom: (setting: ZoomSetting) => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
}

/** The live controls in Tab order; the toolbar is one Tab stop and the arrows move between them. */
const CONTROL_COUNT = 7;

/**
 * The reader's toolbar. Save a Copy, Hand and Select are period decoration
 * (hidden from assistive tech, never focusable); Print, Email and the zoom
 * controls work, as one `role="toolbar"` with a roving tabindex.
 */
export function Toolbar({ zoom, onZoom, onZoomIn, onZoomOut }: ToolbarProps) {
  const controls = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const control = (index: number) => ({
    ref: (element: HTMLElement | null) => {
      controls.current[index] = element;
    },
    tabIndex: index === active ? 0 : -1,
    onFocus: () => setActive(index),
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = nextRovingIndex(event.key, active, CONTROL_COUNT);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    controls.current[next]?.focus();
  };

  return (
    <div className="pc-toolbar" role="toolbar" aria-label="Document" onKeyDown={onKeyDown}>
      <Gripper />
      <Decoration glyph={SAVE_GLYPH} label="Save a Copy" />
      <button type="button" className="pc-tool pc-tool--labelled" {...control(0)} onClick={() => window.print()}>
        <ArtSvg art={PRINT_GLYPH} size={16} />
        Print
      </button>
      <a className="pc-tool pc-tool--labelled" href={emailLink.href} {...control(1)}>
        <ArtSvg art={EMAIL_GLYPH} size={16} />
        Email
      </a>
      <Separator />
      <Gripper />
      <Decoration glyph={HAND_GLYPH} />
      <Decoration glyph={SELECT_GLYPH} label="Select" pressed />
      <Separator />
      <Gripper />
      <IconButton glyph={ZOOM_OUT_GLYPH} label="Zoom out" onClick={onZoomOut} {...control(2)} />
      <select
        className="pc-zoom"
        aria-label="Zoom"
        value={zoomFieldValue(zoom)}
        onChange={(event) => {
          const setting = parseZoomFieldValue(event.target.value);
          if (setting) onZoom(setting);
        }}
        {...control(3)}
      >
        {zoom.kind === 'percent' && !ZOOM_STEPS.includes(zoom.scale) ? (
          <option value={zoomFieldValue(zoom)}>{Math.round(zoom.scale * 100)}%</option>
        ) : null}
        {ZOOM_STEPS.map((step) => (
          <option key={step} value={String(step * 100)}>
            {step * 100}%
          </option>
        ))}
        <option value="fit-width">Fit Width</option>
        <option value="reflow">Reflow</option>
      </select>
      <IconButton glyph={ZOOM_IN_GLYPH} label="Zoom in" onClick={onZoomIn} {...control(4)} />
      <Separator />
      <IconButton
        glyph={FIT_WIDTH_GLYPH}
        label="Fit Width"
        pressed={zoom.kind === 'fit-width'}
        onClick={() => onZoom({ kind: 'fit-width' })}
        {...control(5)}
      />
      <IconButton
        glyph={REFLOW_GLYPH}
        label="Reflow"
        pressed={zoom.kind === 'reflow'}
        onClick={() => onZoom({ kind: 'reflow' })}
        {...control(6)}
      />
    </div>
  );
}

interface IconButtonProps {
  readonly glyph: Art;
  readonly label: string;
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly ref: (element: HTMLElement | null) => void;
  readonly tabIndex: number;
  readonly onFocus: () => void;
}

function IconButton({ glyph, label, pressed, onClick, ref, tabIndex, onFocus }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className="pc-tool"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onClick}
    >
      <ArtSvg art={glyph} size={16} />
    </button>
  );
}

function Decoration({
  glyph,
  label,
  pressed,
}: {
  readonly glyph: Art;
  readonly label?: string;
  readonly pressed?: boolean;
}) {
  return (
    <span
      className={label ? 'pc-tool pc-tool--labelled pc-tool--inert' : 'pc-tool pc-tool--inert'}
      data-pressed={pressed}
      aria-hidden="true"
    >
      <ArtSvg art={glyph} size={16} />
      {label}
    </span>
  );
}

function Gripper(): ReactNode {
  return <span className="pc-toolbar__gripper" aria-hidden="true" />;
}

function Separator(): ReactNode {
  return <span className="pc-toolbar__separator" aria-hidden="true" />;
}
