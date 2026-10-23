import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
} from 'react';
import { flushSync } from 'react-dom';
import { resumeOutline } from '../resume/outline';
import { REDUCED_MOTION, useMediaQuery } from '../useMediaQuery';
import { ARROW_ART, BUSY_ART, cursorValue } from './cursors';
import { Desktop } from './desktop/Desktop';
import { desktopLayout } from './desktop/desktopLayout';
import { useClock } from './desktop/useClock';
import type { PcDisplay, ScreenRect } from './display';
import { PageMeasure } from './pages/PageMeasure';
import { PopOut } from './popout/PopOut';
import { defaultZoom, desktopLayoutSize, type PresentationMode, presentationMode } from './presentation';
import { DocumentPane, scrollToPage } from './reader/DocumentPane';
import { READER_TITLE, ReaderWindow } from './reader/ReaderWindow';
import { Splash, splashRect } from './reader/Splash';
import { StatusBar } from './reader/StatusBar';
import { Toolbar } from './reader/Toolbar';
import { type ResolvedZoom, resolveZoom, type ZoomSetting, zoomIn, zoomOut } from './reader/zoom';
import { isSkipKey } from './session/keys';
import { readerMemory, restoredScrollTop } from './session/memory';
import { CursorDirector, ScriptedCursor } from './session/ScriptedCursor';
import { AWAY, isBusy, isMounted, isStarting, isWindowShown, sessionReducer } from './session/session';
import { MOUNT_MARK, useStoryboard, useStoryboardElements } from './session/useStoryboard';
import './PcExperience.css';

export interface PcExperienceProps {
  readonly display: PcDisplay;
  readonly onLeave: () => void;
  readonly onFocusStage: () => void;
}

const BLOCKS = resumeOutline();
const REFLOW: ZoomSetting = { kind: 'reflow' };
/** The hit area every touch target keeps, in CSS px. */
const TOUCH_TARGET = 44;
const CURSORS = {
  '--pc-cursor': cursorValue(ARROW_ART, 'default'),
  '--pc-busy-cursor': cursorValue(BUSY_ART, 'progress'),
} as CSSProperties;

/** Pagination depends only on the content and the visitor's fonts: once per page load is enough. */
let paginated: number[][] | null = null;

/**
 * The computer's screen: the desktop, the startup sequence and the document
 * reader with the résumé, rendered into the room's live screen element (and,
 * on small pictures, a full-viewport pop-out). Lazy-loaded; it stays mounted
 * once loaded, and the reader itself mounts only for each visit.
 */
export function PcExperience({ display, onLeave, onFocusStage }: PcExperienceProps) {
  const placement = usePlacement(display);
  const mode = usePresentationMode(placement);
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const size = desktopLayoutSize(placement);
  const layout = useMemo(() => desktopLayout(size.width, size.height), [size.width, size.height]);
  const [state, dispatch] = useReducer(sessionReducer, AWAY);
  const clock = useClock(display);
  const [pages, setPages] = useState(paginated);
  const [chosenZoom, setChosenZoom] = useState(readerMemory.zoom);
  const [paneWidth, setPaneWidth] = useState(0);
  const [pageInView, setPageInView] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const titleId = useId();

  // The reader mounts out of sight in a background render, so the startup's frames never wait on it.
  const wantsReader = isMounted(state);
  const mountReader = useDeferredValue(wantsReader) && wantsReader;
  const popOut = mode === 'pop-out';
  const zoomSetting = popOut ? REFLOW : (chosenZoom ?? defaultZoom(paneWidth, mode));
  const zoom = resolveZoom(zoomSetting, paneWidth);
  const scrollLayout = layoutKey(zoom, mode);

  const elements = useStoryboardElements();
  const cursorRef = useCallback(
    (element: HTMLDivElement | null) => {
      elements.cursor.current = element ? new CursorDirector(element) : null;
    },
    [elements],
  );

  const rememberScroll = (): void => {
    const pane = elements.pane.current;
    if (!pane || !state.page) return;
    readerMemory.scroll = { top: pane.scrollTop, range: scrollRange(pane), layout: scrollLayout };
  };

  const controls = useStoryboard({
    display,
    state,
    dispatch,
    mode,
    reducedMotion,
    layout,
    elements,
    rememberScroll,
    announce: setAnnouncement,
    onLeave,
    onFocusStage,
  });

  const onPaginated = useCallback((result: number[][]) => {
    paginated = result;
    setPages(result);
  }, []);

  // Ready once the document is typeset at its zoom: put the visitor back where they were, then report.
  const documentReady = mountReader && pages !== null && (popOut || paneWidth > 0);
  const onDocumentReady = useEffectEvent(() => {
    const pane = elements.pane.current;
    if (pane) pane.scrollTop = restoredScrollTop(readerMemory.scroll, scrollLayout, scrollRange(pane));
    if (performance.getEntriesByName(MOUNT_MARK, 'mark').length > 0) {
      performance.measure(MOUNT_MARK, MOUNT_MARK);
      performance.clearMarks(MOUNT_MARK);
    }
    dispatch({ type: 'ready' });
  });
  useEffect(() => {
    if (documentReady) onDocumentReady();
  }, [documentReady]);

  /** A zoom change keeps the same share of the document in view. */
  const changeZoom = (setting: ZoomSetting): void => {
    const pane = elements.pane.current;
    const share = pane && scrollRange(pane) > 0 ? pane.scrollTop / scrollRange(pane) : 0;
    readerMemory.zoom = setting;
    flushSync(() => setChosenZoom(setting));
    if (pane) pane.scrollTop = share * scrollRange(pane);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      controls.close();
    } else if (isStarting(state) && isSkipKey(event.key)) {
      event.preventDefault();
      controls.skip();
    }
  };
  const onPointerDown = (): void => {
    if (isStarting(state)) controls.skip();
  };

  const windowShown = isWindowShown(state);
  const pageCount = pages?.length ?? 0;
  const goTo = (page: number): void => {
    if (elements.pane.current) scrollToPage(elements.pane.current, page);
  };
  const documentPane = (
    <DocumentPane
      blocks={BLOCKS}
      // Typeset only once the pane's width (and so the zoom) is known: never lay the résumé out twice.
      pages={popOut || paneWidth > 0 ? pages : null}
      zoom={zoom}
      pageShown={state.page}
      screenScale={popOut ? 1 : size.scale}
      className={popOut ? 'pc-pane pc-pane--popout' : 'pc-pane'}
      paneRef={elements.pane}
      layerRef={elements.pageLayer}
      onWidth={setPaneWidth}
      onPageInView={setPageInView}
    />
  );

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the screen's root catches Escape and the skip keys from anything inside it. */}
      <div
        ref={elements.root}
        className="pc-screen"
        data-pc-state={state.phase}
        data-pc-mode={mode}
        data-busy={isBusy(state)}
        tabIndex={-1}
        style={{ ...CURSORS, width: layout.width, height: layout.height, transform: `scale(${size.scale})` }}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
      >
        <Desktop
          layout={layout}
          selected={state.selected}
          taskTitle={windowShown ? READER_TITLE : null}
          clock={clock}
          pixelsPerLayoutPx={size.scale * window.devicePixelRatio}
        />
        {mountReader ? (
          <ReaderWindow
            variant={popOut ? 'ghost' : 'dialog'}
            shown={windowShown}
            titleId={titleId}
            closeHitSize={TOUCH_TARGET / size.scale}
            onClose={controls.close}
            windowRef={elements.glassWindow}
            toolbar={
              <Toolbar
                zoom={zoomSetting}
                onZoom={changeZoom}
                onZoomIn={() => changeZoom(zoomIn(zoomSetting, paneWidth))}
                onZoomOut={() => changeZoom(zoomOut(zoomSetting, paneWidth))}
              />
            }
            document={popOut ? <div className="pc-pane" /> : documentPane}
            status={<StatusBar page={pageInView} pageCount={pageCount} onGoTo={goTo} />}
          />
        ) : null}
        {state.phase === 'splash' ? (
          <Splash ref={elements.splash} rect={splashRect(layout.width, layout.taskbar.y)} status={state.status} />
        ) : null}
        <ScriptedCursor ref={cursorRef} />
        <p className="pc-screen__announcer" aria-live="polite">
          {announcement}
        </p>
        {mountReader && !pages ? <PageMeasure blocks={BLOCKS} onPaginated={onPaginated} /> : null}
      </div>
      {mountReader && popOut ? (
        <PopOut
          shown={state.breakout && windowShown}
          titleId={titleId}
          page={pageInView}
          pageCount={pageCount}
          onClose={controls.close}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          rootRef={elements.popOut}
          windowRef={elements.popOutWindow}
          scrimRef={elements.scrim}
          document={documentPane}
        />
      ) : null}
    </>
  );
}

function usePlacement(display: PcDisplay): ScreenRect {
  const subscribe = useCallback((onChange: () => void) => display.onPlacementChange(onChange), [display]);
  return useSyncExternalStore(subscribe, () => display.placement);
}

/** The presentation mode with its hysteresis: the previous mode is part of the answer. */
function usePresentationMode(placement: ScreenRect): PresentationMode {
  const [mode, setMode] = useState(() => presentationMode(placement, null));
  const next = presentationMode(placement, mode);
  if (next !== mode) setMode(next);
  return next;
}

function scrollRange(pane: HTMLElement): number {
  return pane.scrollHeight - pane.clientHeight;
}

/** Which layout a scroll position belongs to: positions carry over exactly only within the same one. */
function layoutKey(zoom: ResolvedZoom, mode: PresentationMode): string {
  return zoom.kind === 'pages' ? `pages:${zoom.scale.toFixed(4)}` : `reflow:${mode}`;
}
