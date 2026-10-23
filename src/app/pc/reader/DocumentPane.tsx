import { type CSSProperties, type Ref, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { ResumeBlock } from '../../resume/outline';
import { ResumePages } from '../pages/ResumePages';
import { PAGE_WIDTH, type ResolvedZoom } from './zoom';

export interface DocumentPaneProps {
  readonly blocks: readonly ResumeBlock[];
  /** Page groups; null leaves the pane empty (the window has opened, the page has not). */
  readonly pages: readonly (readonly number[])[] | null;
  readonly zoom: ResolvedZoom;
  /** The page fades in after the window opens; until then the pane is empty grey. */
  readonly pageShown: boolean;
  /** Reflow text is 16 CSS px whatever the screen's scale. */
  readonly screenScale: number;
  readonly className: string;
  readonly paneRef: Ref<HTMLDivElement>;
  readonly layerRef: Ref<HTMLDivElement>;
  /** The pane's client width in layout px, on mount and whenever it changes. */
  readonly onWidth: (width: number) => void;
  /** The page (0-based) in the middle of the pane. */
  readonly onPageInView: (index: number) => void;
}

/**
 * The scrolling document: A4 sheets laid out once at 100 % and scaled with a
 * transform inside a box sized to the scaled pages (zoom never re-lays out),
 * or the reflowed sheets. Native scrolling, keyboard included (`tabIndex=0`).
 */
export function DocumentPane({
  blocks,
  pages,
  zoom,
  pageShown,
  screenScale,
  className,
  paneRef,
  layerRef,
  onWidth,
  onPageInView,
}: DocumentPaneProps) {
  const pane = useRef<HTMLDivElement | null>(null);
  const reportWidth = useEffectEvent(onWidth);
  const reportPage = useEffectEvent(onPageInView);

  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) return;
    reportWidth(element.clientWidth);
    const observer = new ResizeObserver(() => reportWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The current page is whichever crosses a thin band at the pane's middle: no scroll listener.
  const sheets = zoom.kind === 'reflow' ? 'reflow' : 'a4';
  useEffect(() => {
    const element = pane.current;
    if (!element || !pages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reportPage(Number((entry.target as HTMLElement).dataset.page) - 1);
        }
      },
      { root: element, rootMargin: '-45% 0px -54% 0px' },
    );
    for (const page of element.querySelectorAll(`.pc-doc--${sheets} [data-page]`)) observer.observe(page);
    return () => observer.disconnect();
  }, [pages, sheets]);

  return (
    <div
      ref={(element) => {
        pane.current = element;
        assign(paneRef, element);
      }}
      className={className}
      role="document"
      aria-label="Roel Leenders' résumé"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the pane scrolls with the keyboard, like a reader's page.
      tabIndex={0}
      data-zoom={zoom.kind === 'pages' ? zoom.scale.toFixed(4) : 'reflow'}
    >
      <div ref={layerRef} className="pc-pane__layer" style={{ opacity: pageShown ? 1 : 0 }}>
        {pages ? (
          zoom.kind === 'reflow' ? (
            <ResumePages blocks={blocks} pages={pages} layout="reflow" style={{ fontSize: 16 / screenScale }} />
          ) : (
            <ScaledPages blocks={blocks} pages={pages} scale={zoom.scale} />
          )
        ) : null}
      </div>
    </div>
  );
}

/** A4 pages at 100 % inside a box the size of the scaled pages, so the pane scrolls the scaled document. */
function ScaledPages({
  blocks,
  pages,
  scale,
}: {
  readonly blocks: readonly ResumeBlock[];
  readonly pages: readonly (readonly number[])[];
  readonly scale: number;
}) {
  const sheets = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = sheets.current;
    if (!element) return;
    setHeight(element.offsetHeight);
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const box: CSSProperties = { width: PAGE_WIDTH * scale, height: height * scale };
  return (
    <div className="pc-pane__pages" style={box}>
      <ResumePages
        ref={sheets}
        blocks={blocks}
        pages={pages}
        layout="a4"
        style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
      />
    </div>
  );
}

/** The grey gap kept above a page scrolled to the top, as between pages. */
const PAGE_GAP = 12;

/** Scrolls `pane` so page `index` (0-based) starts at its top, whatever transforms the screen is under. */
export function scrollToPage(pane: HTMLElement, index: number): void {
  const page = pane.querySelector(`[data-page="${index + 1}"]`);
  if (!page) return;
  const paneBox = pane.getBoundingClientRect();
  // Screen px → the pane's own px, so this holds inside the scaled screen and at any zoom.
  const screenScale = paneBox.width / (pane.offsetWidth || 1);
  const offset = (page.getBoundingClientRect().top - paneBox.top) / screenScale;
  pane.scrollTo({ top: pane.scrollTop + offset - PAGE_GAP });
}

function assign<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}
