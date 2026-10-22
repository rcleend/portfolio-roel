import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { onFirstGesture } from '../audio/firstGesture';
import { type Board, boardTiles, type Tile } from './boards/board';
import type { Picks } from './boards/subject';
import { useShortcuts } from './input/useShortcuts';
import { type PreviewRuntime, PreviewRuntimeContext } from './runtime/PreviewRuntime';
import { currentShared, type PlaygroundState, reducePlayground } from './state/playgroundState';
import { type UrlState, writeUrlState } from './state/urlState';
import { Transport } from './transport/Transport';
import { BoardView } from './ui/BoardView';
import { FocusView } from './ui/FocusView';
import { Notice } from './ui/Notice';
import { PixelIcon } from './ui/PixelIcon';
import { Settings } from './ui/Settings';

interface PlaygroundProps {
  readonly runtime: PreviewRuntime;
  readonly boards: readonly Board[];
  /** The page the URL asked for, and anything it asked for that is not there. */
  readonly initial: UrlState;
}

/** Digits open the first nine tiles, in page order. */
const SHORTCUT_TILES = 9;
/** Shared picks of a board the state has none for: stable, so its tiles are not rebuilt on every render. */
const NO_PICKS: Picks = {};

/**
 * The playground page: boards of live tiles over one shared transport, and
 * focus mode for one combination at a time. Everything a link can share
 * lives in the URL.
 */
export function Playground({ runtime, boards, initial }: PlaygroundProps) {
  const { loop, audio } = runtime;
  const [state, dispatch] = useReducer(reducePlayground, initial.state);
  const [problems, setProblems] = useState(initial.problems);
  const opener = useRef<Element | null>(null);
  const shortcuts = useMemo(() => numberTiles(boards), [boards]);
  const focused = state.focus !== null;

  useUrlSync(state, boards);
  useSoundWiring(runtime, state.sound);
  useEffect(() => {
    loop.start();
    return () => loop.stop();
  }, [loop]);
  useEffect(() => loop.setCovered(focused), [loop, focused]);
  // Closing focus mode hands keyboard focus back to whatever opened it.
  useEffect(() => {
    if (focused) return;
    const element = opener.current;
    opener.current = null;
    if (element instanceof HTMLElement) element.focus({ preventScroll: true });
  }, [focused]);

  const open = useCallback((tile: Tile) => {
    // A digit pressed in focus mode swaps the combination; focus still goes back to what first opened it.
    opener.current ??= document.activeElement;
    dispatch({ type: 'focus', focus: { subject: tile.board.subject, picks: tile.picks } });
  }, []);
  const close = useCallback(() => dispatch({ type: 'focus', focus: null }), []);
  const share = useCallback(
    (board: Board, picker: string, choice: string) => dispatch({ type: 'share', board: board.id, picker, choice }),
    [],
  );

  useShortcuts((shortcut) => {
    switch (shortcut.type) {
      case 'replay':
        return loop.replay();
      case 'togglePlay':
        return loop.togglePlay();
      case 'step':
        return loop.step(shortcut.delta);
      case 'close':
        return close();
      case 'focusTile': {
        const tile = pageTiles(boards, state.shared)[shortcut.index];
        if (tile) open(tile);
        return;
      }
    }
  });

  const timeline = (state.focus?.subject ?? boards[0]?.subject)?.timeline;
  return (
    <PreviewRuntimeContext value={runtime}>
      <div className="playground">
        <header className="bar">
          <div className="bar__row">
            <h1 className="brand">
              <PixelIcon name="tv" /> Playground
            </h1>
            <nav className="bar__nav" aria-label="Boards">
              {boards.map((board) => (
                <a key={board.id} href={`#${board.id}`} onClick={close}>
                  {board.title}
                </a>
              ))}
            </nav>
            <Settings state={state} dispatch={dispatch} audio={audio} />
          </div>
          {timeline ? <Transport loop={loop} timeline={timeline} /> : null}
        </header>
        <div className="playground__body">
          <main className="playground__boards">
            {problems.length > 0 ? <Notice problems={problems} onDismiss={() => setProblems([])} /> : null}
            {boards.map((board) => (
              <BoardView
                key={board.id}
                board={board}
                shared={state.shared[board.id] ?? NO_PICKS}
                shortcuts={shortcuts}
                zoom={state.zoom}
                crt={state.crt}
                reducedMotion={state.reducedMotion}
                onShare={share}
                onOpen={open}
              />
            ))}
          </main>
          {state.focus ? (
            <FocusView
              focus={state.focus}
              crt={state.crt}
              reducedMotion={state.reducedMotion}
              audio={state.sound ? audio : undefined}
              onPick={(picker, choice) => dispatch({ type: 'focusPick', picker, choice })}
              onClose={close}
            />
          ) : null}
        </div>
      </div>
    </PreviewRuntimeContext>
  );
}

/** Every tile on the page, in page order. */
function pageTiles(boards: readonly Board[], shared: PlaygroundState['shared']): readonly Tile[] {
  return boards.flatMap((board) => boardTiles(board, shared[board.id] ?? currentShared(board)));
}

/** The digit of each of the first nine tiles, by tile key; keys do not depend on the shared picks. */
function numberTiles(boards: readonly Board[]): ReadonlyMap<string, number> {
  const tiles = pageTiles(boards, {}).slice(0, SHORTCUT_TILES);
  return new Map(tiles.map((tile, index) => [tile.key, index + 1]));
}

/** Keeps the URL describing the page, without adding history entries for every click. */
function useUrlSync(state: PlaygroundState, boards: readonly Board[]): void {
  useEffect(() => {
    const query = writeUrlState(state, boards);
    const { pathname, search, hash } = window.location;
    const next = query ? `?${query}` : '';
    if (next !== search) window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`);
  }, [state, boards]);
}

function useSoundWiring({ audio, loop }: PreviewRuntime, sound: boolean): void {
  // A link may arrive with sound on, and browsers only start audio from a gesture.
  useEffect(() => {
    if (!sound) return;
    return onFirstGesture(window, () => audio.unlock());
  }, [audio, sound]);

  // The synthesiser holds its notes while the transport is paused, as the game's does when set aside.
  useEffect(() => {
    let paused: boolean | null = null;
    const follow = (): void => {
      const pause = !loop.clock.state.playing;
      if (pause === paused) return;
      paused = pause;
      audio.setPaused(pause);
    };
    follow();
    return loop.clock.subscribe(follow);
  }, [audio, loop]);
}
