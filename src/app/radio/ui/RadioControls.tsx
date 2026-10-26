import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Album } from '@/content/radio/types';
import { nextRovingIndex } from '../../a11y/roving';
import { useKeyboardModality } from '../../a11y/useKeyboardModality';
import { browserStorage } from '../../storage/localFlag';
import { COARSE_POINTER, useMediaQuery } from '../../useMediaQuery';
import type { DiscAnchor, RadioDeck, RadioKey, RadioLayout, ScreenRect } from '../deck';
import { liveText } from '../player/announce';
import type { PlayerSnapshot, RadioPlayer } from '../player/RadioPlayer';
import {
  type HintInput,
  learn,
  loadRadioHints,
  RADIO_HINT_DELAY_MS,
  type RadioHintKind,
  radioHintFor,
  radioHintText,
  saveRadioHints,
} from './radioHints';
import { RAIL_QUERY, TransportBar } from './TransportBar';
import './RadioControls.css';

export interface RadioControlsProps {
  readonly deck: RadioDeck;
  readonly player: RadioPlayer;
  readonly snapshot: PlayerSnapshot;
  readonly albums: readonly Album[];
  readonly muted: boolean;
  readonly onLeave: () => void;
  readonly onFocusStage: () => void;
}

/** The DOM toolbar over the keys, in this order (fine pointers; the touch bar replaces it). */
const KEYS: readonly { readonly key: RadioKey; readonly label: (playing: boolean) => string }[] = [
  { key: 'previous', label: () => 'Previous track' },
  { key: 'play-pause', label: (playing) => (playing ? 'Pause' : 'Play') },
  { key: 'stop', label: () => 'Stop' },
  { key: 'next', label: () => 'Next track' },
];

/**
 * The CD player's controls, portaled into the room's controls slot over the radio (SPEC
 * §8.7): a CDs toolbar whose buttons sit on the floating discs, the transport over the
 * radio's own keys (or the touch bar), the caption under the disc that has the visitor's
 * attention, the radio's hint and its one live region. The buttons are invisible to the
 * pointer, which plays with the 3D model; the keyboard and screen readers use them, and
 * a keyboard focus shows as a ring on the disc or key itself.
 */
export function RadioControls({ deck, player, snapshot, albums, muted, onLeave, onFocusStage }: RadioControlsProps) {
  const root = useRef<HTMLElement>(null);
  const howTo = useId();
  const cds = useRef<(HTMLButtonElement | null)[]>([]);
  const live = useLive(deck);
  const shelfUp = useDiscsOut(deck);
  const layout = useLayout(deck);
  const attended = useAttention(deck);
  const coarse = useMediaQuery(COARSE_POINTER);
  const rail = useMediaQuery(RAIL_QUERY);
  const words = useAnnouncements(player);
  // The camera's landing focuses a CD from a script: a keyboard user sees it ringed and brought forward, a mouse
  // or touch user does not (Chrome would ring it for them too, see useKeyboardModality).
  const keyboard = useKeyboardModality();
  const hint = useRadioHint(live, live && shelfUp, coarse, keyboard, snapshot.disc !== null);
  const risen = useShelfRisen(live, shelfUp);
  // On a phone held upright the bar carries the line (the radio's front fills the bottom of the frame).
  const hintInBar = coarse && !rail;
  const loadedIndex = albums.findIndex((album) => album.id === snapshot.disc);
  const [activeCd, setActiveCd] = useState(Math.max(0, loadedIndex));
  const [activeKey, setActiveKey] = useState(1);

  // Arriving: the keyboard lands on the CDs (the loaded disc's button, else the first). Leaving with
  // focus inside: the hidden controls give it back to the stage.
  const onLive = useEffectEvent((isLive: boolean) => {
    if (isLive) {
      const index = Math.max(
        0,
        albums.findIndex((album) => album.id === player.getSnapshot().disc),
      );
      setActiveCd(index);
      cds.current[index]?.focus({ preventScroll: true });
    } else if (root.current?.contains(document.activeElement)) {
      onFocusStage();
    }
  });
  useEffect(() => {
    if (deck.live) onLive(true);
    return deck.onLiveChange((isLive) => onLive(isLive));
  }, [deck]);

  const pickOrToggle = (album: Album): void => {
    if (album.id === player.getSnapshot().disc) player.press('play-pause');
    else player.pick(album.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onLeave();
  };

  const playing = snapshot.transport === 'playing' && snapshot.disc !== null;
  const empty = snapshot.disc === null;
  return (
    <section
      ref={root}
      className="radio"
      aria-label="CD player"
      data-coarse={coarse}
      data-rail={rail}
      data-live={live}
      data-keyboard={keyboard}
      onKeyDown={onKeyDown}
    >
      {/* Focus lands on a CD, past the stage's label: the toolbar says how to play one and how to leave. */}
      <p id={howTo} className="radio__hidden">
        Enter plays a CD; Escape returns to the room.
      </p>
      <div
        role="toolbar"
        aria-label="CDs"
        aria-describedby={howTo}
        onKeyDown={(event) => {
          const next = nextRovingIndex(event.key, activeCd, albums.length);
          if (next === null) return;
          event.preventDefault();
          setActiveCd(next);
          cds.current[next]?.focus();
        }}
      >
        {albums.map((album, index) => {
          const loaded = album.id === snapshot.disc;
          const count = album.tracks.length;
          return (
            <button
              key={album.id}
              ref={(element) => {
                cds.current[index] = element;
              }}
              type="button"
              className="radio__cd"
              style={anchorStyle(layout, album.id)}
              tabIndex={index === activeCd ? 0 : -1}
              aria-current={loaded ? 'true' : undefined}
              aria-label={`${album.title} by ${album.artist}, ${count} ${count === 1 ? 'track' : 'tracks'}${loaded ? ', in the player' : ''}`}
              onFocus={(event) => {
                setActiveCd(index);
                // Only a keyboard focus brings the disc forward: the landing's after a click must not.
                if (keyboard && event.currentTarget.matches(':focus-visible')) deck.setAttention(album.id);
              }}
              onBlur={() => deck.setAttention(null)}
              onClick={() => pickOrToggle(album)}
            />
          );
        })}
      </div>
      {coarse ? (
        <TransportBar
          deck={deck}
          player={player}
          snapshot={snapshot}
          onLeave={onLeave}
          hint={hintInBar && hint.visible ? hint.text : null}
        />
      ) : (
        <div
          role="toolbar"
          aria-label="CD player controls"
          onKeyDown={(event) => {
            const next = nextRovingIndex(event.key, activeKey, KEYS.length);
            if (next === null) return;
            event.preventDefault();
            setActiveKey(next);
            root.current?.querySelectorAll<HTMLElement>('.radio__key')[next]?.focus();
          }}
        >
          {KEYS.map(({ key, label }, index) => (
            <button
              key={key}
              type="button"
              className="radio__key"
              style={rectStyle(layout.keys[key])}
              tabIndex={index === activeKey ? 0 : -1}
              aria-disabled={empty ? 'true' : undefined}
              onFocus={() => setActiveKey(index)}
              onClick={() => player.press(key)}
            >
              {label(playing)}
            </button>
          ))}
        </div>
      )}
      <Caption
        album={albums.find((album) => album.id === attended) ?? null}
        anchor={captionAnchor(anchorOf(layout, attended), risen)}
        muted={muted}
      />
      {hintInBar ? null : (
        <p className="radio__hint radio__plate" aria-hidden="true" data-visible={hint.visible}>
          {hint.text ? (
            <>
              <span className="radio__marker">▸</span>
              {hint.text}
            </>
          ) : null}
        </p>
      )}
      <p className="radio__announcer" role="status">
        {words}
      </p>
    </section>
  );
}

/**
 * Whether the shelf has come up on this visit. The layout places a disc at its slot, so before the rise is done a
 * caption would wait there, away from a disc (and a pointer) still on its way up.
 */
function useShelfRisen(live: boolean, shelfUp: boolean): boolean {
  const [risen, setRisen] = useState(false);
  if (live && shelfUp && !risen) setRisen(true);
  if (!live && risen) setRisen(false);
  return risen;
}

/** A caption's anchor: a floating disc's once the shelf is up; the one in the player's at once (it never rises). */
function captionAnchor(anchor: DiscAnchor | null, risen: boolean): DiscAnchor | null {
  return anchor && (risen || anchor.inPlayer) ? anchor : null;
}

/** The plate under the disc that has the visitor's attention: what it is and how long. */
function Caption({ album, anchor, muted }: { album: Album | null; anchor: DiscAnchor | null; muted: boolean }) {
  // Keeps the last disc's words while fading out.
  const [shown, setShown] = useState<{ album: Album; anchor: DiscAnchor } | null>(null);
  if (album && anchor && (shown?.album !== album || shown.anchor !== anchor)) setShown({ album, anchor });
  // The plate is in the document from the start, empty and hidden: an element inserted already visible takes its end
  // style at once, so the first attention of a visit would skip the fade (and a finger's 250 ms hold) and flash.
  return (
    <div
      className="radio__caption radio__plate"
      aria-hidden="true"
      data-visible={album !== null && anchor !== null}
      // Under a floating disc; over the one in the player, so the radio's keys stay in sight.
      data-above={shown?.anchor.inPlayer ?? false}
      style={shown ? captionPosition(shown.anchor) : undefined}
    >
      {shown ? <CaptionWords album={shown.album} muted={muted} /> : null}
    </div>
  );
}

function captionPosition(anchor: DiscAnchor): CSSProperties {
  const gap = anchor.radius + 10;
  return { '--x': `${anchor.x}px`, '--y': `${anchor.y + (anchor.inPlayer ? -gap : gap)}px` } as CSSProperties;
}

function CaptionWords({ album, muted }: { album: Album; muted: boolean }) {
  const seconds = Math.round(album.tracks.reduce((sum, track) => sum + track.seconds, 0));
  const count = album.tracks.length;
  return (
    <>
      <span className="radio__caption-title">
        {album.title} — {album.artist}
      </span>
      <span>
        {count} {count === 1 ? 'track' : 'tracks'} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        {album.placeholder ? <span className="radio__tag">placeholder</span> : null}
        {muted ? <span className="radio__tag">Sound is off</span> : null}
      </span>
    </>
  );
}

/**
 * The radio's teaching line (radioHints.ts): shown a beat after the discs are up (never before: it names them), in
 * the words of the input in use. `text` stays while the line fades out.
 */
function useRadioHint(live: boolean, shelfUp: boolean, coarse: boolean, keyboard: boolean, picked: boolean) {
  const [storage] = useState(browserStorage);
  const [progress, setProgress] = useState(() => loadRadioHints(storage));
  const [shown, setShown] = useState<RadioHintKind | null>(null);
  const [last, setLast] = useState<{ kind: RadioHintKind; input: HintInput } | null>(null);
  const wasLive = useRef(live);

  const record = useCallback(
    (done: 'pickedCd' | 'leftRadio') =>
      setProgress((current) => {
        const next = learn(current, done);
        if (next !== current) saveRadioHints(storage, next);
        return next;
      }),
    [storage],
  );
  useEffect(() => {
    if (picked) record('pickedCd');
  }, [picked, record]);
  useEffect(() => {
    if (wasLive.current && !live) record('leftRadio');
    wasLive.current = live;
  }, [live, record]);

  const input: HintInput = keyboard ? 'keyboard' : coarse ? 'touch' : 'mouse';
  const wanted = shelfUp ? radioHintFor(progress, coarse) : null;
  useEffect(() => {
    setShown(null);
    if (!wanted) return;
    const timer = window.setTimeout(() => setShown(wanted), RADIO_HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [wanted]);
  useEffect(() => {
    if (shown) setLast({ kind: shown, input });
  }, [shown, input]);

  return { visible: shown !== null, text: last ? radioHintText(last.kind, last.input) : null };
}

/** True while every disc not in the player hangs in its slot at the radio. */
function useDiscsOut(deck: RadioDeck): boolean {
  const subscribe = useCallback((listener: () => void) => deck.onDiscsOutChange(listener), [deck]);
  return useSyncExternalStore(subscribe, () => deck.discsOut);
}

/** True while the camera rests at the radio. */
function useLive(deck: RadioDeck): boolean {
  const subscribe = useCallback((listener: () => void) => deck.onLiveChange(listener), [deck]);
  return useSyncExternalStore(subscribe, () => deck.live);
}

/** Where the discs and keys are on the page at the settled radio pose. */
function useLayout(deck: RadioDeck): RadioLayout {
  const subscribe = useCallback((listener: () => void) => deck.onLayoutChange(listener), [deck]);
  return useSyncExternalStore(subscribe, () => deck.layout);
}

/** The disc that has the visitor's attention (pointer, else keyboard), as the room reports it. */
function useAttention(deck: RadioDeck): string | null {
  const [disc, setDisc] = useState<string | null>(null);
  useEffect(() => deck.onAttentionChange(setDisc), [deck]);
  return disc;
}

/** The live region's text: each announcement replaces the last, and a repeat still changes it. */
function useAnnouncements(player: RadioPlayer): string {
  const [text, setText] = useState('');
  useEffect(() => player.onAnnounce((words) => setText((current) => liveText(words, current))), [player]);
  return text;
}

function anchorOf(layout: RadioLayout, disc: string | null): DiscAnchor | null {
  return disc === null ? null : (layout.discs.find((anchor) => anchor.disc === disc) ?? null);
}

/** A disc's button: a circle over its attention pose (or the seat); still focusable before the room places it. */
function anchorStyle(layout: RadioLayout, disc: string): CSSProperties {
  const anchor = anchorOf(layout, disc);
  if (!anchor) return { width: 0, height: 0 };
  const size = anchor.radius * 2;
  return {
    width: size,
    height: size,
    transform: `translate(${anchor.x - anchor.radius}px, ${anchor.y - anchor.radius}px)`,
  };
}

function rectStyle(rect: ScreenRect): CSSProperties {
  return { width: rect.width, height: rect.height, transform: `translate(${rect.left}px, ${rect.top}px)` };
}
