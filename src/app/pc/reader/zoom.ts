/**
 * The reader's zoom: a fixed percentage, Fit Width (a percentage derived from
 * the document pane) or Reflow (the same pages re-typeset at the pane's
 * width). Percentages only ever scale the A4 pages with a transform, so a
 * zoom change never re-lays out or re-paginates the résumé.
 */
export type ZoomSetting =
  | { readonly kind: 'percent'; readonly scale: number }
  | { readonly kind: 'fit-width' }
  | { readonly kind: 'reflow' };

/** How the pages are shown for a setting in a given pane. */
export type ResolvedZoom = { readonly kind: 'pages'; readonly scale: number } | { readonly kind: 'reflow' };

/** CSS px of an A4 page at 100 %. */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
/** Grey margin kept on both sides of the page at Fit Width. */
export const FIT_GUTTER = 24;
/** Fit Width never blows the page up beyond this on very wide panes. */
export const FIT_MAX = 1.5;
/** The zoom field's fixed steps, also what Zoom in and Zoom out walk through. */
export const ZOOM_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** The A4 scale that fits the page's width into a pane of `paneClientWidth` layout px. */
export function fitWidthScale(paneClientWidth: number): number {
  return Math.min(FIT_MAX, Math.max(0, paneClientWidth - FIT_GUTTER) / PAGE_WIDTH);
}

export function resolveZoom(setting: ZoomSetting, paneClientWidth: number): ResolvedZoom {
  if (setting.kind === 'reflow') return setting;
  return { kind: 'pages', scale: setting.kind === 'percent' ? setting.scale : fitWidthScale(paneClientWidth) };
}

/** The next step above what the pane shows now; Reflow counts as Fit Width's scale. */
export function zoomIn(setting: ZoomSetting, paneClientWidth: number): ZoomSetting {
  const current = currentScale(setting, paneClientWidth);
  const next = ZOOM_STEPS.find((step) => step > current + EPSILON);
  return { kind: 'percent', scale: next ?? lastStep() };
}

export function zoomOut(setting: ZoomSetting, paneClientWidth: number): ZoomSetting {
  const current = currentScale(setting, paneClientWidth);
  const previous = ZOOM_STEPS.findLast((step) => step < current - EPSILON);
  return { kind: 'percent', scale: previous ?? firstStep() };
}

/** The zoom field's option value for a setting: "100", "fit-width" or "reflow". */
export function zoomFieldValue(setting: ZoomSetting): string {
  return setting.kind === 'percent' ? String(Math.round(setting.scale * 100)) : setting.kind;
}

export function parseZoomFieldValue(value: string): ZoomSetting | null {
  if (value === 'fit-width' || value === 'reflow') return { kind: value };
  const percent = Number(value);
  return ZOOM_STEPS.includes(percent / 100) ? { kind: 'percent', scale: percent / 100 } : null;
}

export function sameZoom(a: ZoomSetting, b: ZoomSetting): boolean {
  return zoomFieldValue(a) === zoomFieldValue(b);
}

/** Floating-point slack so a Fit Width of exactly 100 % still steps to 125 %. */
const EPSILON = 1e-3;

function currentScale(setting: ZoomSetting, paneClientWidth: number): number {
  return setting.kind === 'percent' ? setting.scale : fitWidthScale(paneClientWidth);
}

function firstStep(): number {
  return ZOOM_STEPS[0] ?? 1;
}

function lastStep(): number {
  return ZOOM_STEPS.at(-1) ?? 1;
}
