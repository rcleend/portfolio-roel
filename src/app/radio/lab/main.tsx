import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { type AudioMeasurement, measure } from '@/engine/audio/mix/meter';
import { channelData, renderSfx } from '@/engine/audio/offline';
import { sfxLength } from '@/engine/audio/sfx/recipe';
import type { RadioIntent, RoomView } from '../deck';
import { FOLEY_CUES, FOLEY_LEVELS, type FoleyCue, foleyRecipe } from '../player/foley';
import { RadioSlot } from '../RadioSlot';
import { FakeDeck, type LabEvent, lcdText } from './FakeDeck';
import '../../styles.css';

/**
 * Radio lab (`/radio-lab.html`, development only): the CD player on a stand-in deck, without
 * the room. The panel moves the camera; clicking outside the radio leaves, like the room.
 * `?view=radio` lands at once, `?muted=1` starts with the sound off, `?coarse=1` behaves like a
 * touch screen, `?pick=<album>` picks that disc as soon as the player has loaded, without a
 * gesture (the autoplay-policy check), and `?clean` hides the panel. `window.__radioLab` drives
 * it from Playwright and records what the player asked of the deck.
 */
const params = new URLSearchParams(window.location.search);
if (params.has('clean')) document.body.classList.add('clean');
if (params.get('coarse') === '1') emulateTouchScreen();

// The site unlocks the game's audio on the first gesture anywhere, so by the radio the audio device is open and the
// radio's own small context costs next to nothing. The lab does the same, so it measures like the site.
let gameAudio: AudioContext | null = null;
const unlockLikeTheGame = (): void => {
  gameAudio ??= new AudioContext();
  void gameAudio.resume();
};
window.addEventListener('pointerdown', unlockLikeTheGame, { capture: true, once: true });
window.addEventListener('keydown', unlockLikeTheGame, { capture: true, once: true });

const FLIGHT_MS = 1100;
const REDUCED_CUT_MS = 280;

const backdrop = byId('backdrop');
const deck = new FakeDeck(byId('stage'), byId('controls'));
const status = byId('status');

let view: RoomView = 'room';
let muted = params.get('muted') === '1';
let flight: number | null = null;
const listeners = new Set<() => void>();
const changed = (): void => {
  for (const listener of listeners) listener();
};

function setView(next: RoomView): void {
  if (flight !== null) window.clearTimeout(flight);
  flight = null;
  if (view === 'radio' && next !== 'radio') deck.conceal();
  view = next;
  changed();
}

/** The camera flies to the radio and lands (`instant`: at once, for checks that do not need the flight). */
function fly(instant = false): void {
  setView('radio');
  deck.approach();
  if (instant) {
    deck.reveal();
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  flight = window.setTimeout(
    () => {
      flight = null;
      deck.reveal();
      changed();
    },
    reduced ? REDUCED_CUT_MS : FLIGHT_MS,
  );
}

function leave(): void {
  setView('room');
}

function loaded(): boolean {
  return deck.controls.querySelector('.radio') !== null;
}

backdrop.addEventListener('pointerdown', () => {
  if (view === 'radio') leave();
});
byId('panel').addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).dataset.action;
  if (action === 'radio') fly();
  else if (action === 'room' || action === 'tv' || action === 'pc') setView(action);
  else if (action === 'mute') {
    muted = !muted;
    changed();
  }
});

function Lab() {
  const current = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => `${view}|${muted}|${flight === null}`,
  );
  const [currentView, currentMuted, currentSettled] = current.split('|');
  return (
    <RadioSlot
      deck={deck}
      view={currentView as RoomView}
      settled={currentSettled === 'true'}
      powered
      muted={currentMuted === 'true'}
      onLeave={() => {
        deck.log('leave');
        leave();
      }}
      onFocusStage={() => {
        deck.log('focusStage');
        backdrop.focus({ preventScroll: true });
      }}
    />
  );
}

declare global {
  interface Window {
    __radioLab?: {
      readonly deck: FakeDeck;
      readonly events: readonly LabEvent[];
      fly(instant?: boolean): void;
      leave(): void;
      setView(view: RoomView): void;
      loaded(): boolean;
      emitIntent(intent: RadioIntent): void;
      readonly foleyCues: readonly FoleyCue[];
      readonly foleyLevels: Readonly<Record<FoleyCue, number>>;
      /** Renders one foley cue offline through the engine's mixer and measures it. */
      measureFoley(cue: FoleyCue, order?: number): Promise<AudioMeasurement & { readonly lengthSeconds: number }>;
    };
  }
}
window.__radioLab = {
  deck,
  events: deck.events,
  fly,
  leave,
  setView,
  loaded,
  emitIntent: (intent) => deck.emitIntent(intent),
  foleyCues: FOLEY_CUES,
  foleyLevels: FOLEY_LEVELS,
  measureFoley: async (cue, order = 0) => {
    const recipe = foleyRecipe(cue, order);
    const lengthSeconds = sfxLength(recipe);
    // Rendered past its end, so the tail proves it has died away.
    const buffer = await renderSfx(recipe, lengthSeconds + 0.25);
    return { lengthSeconds, ...measure(channelData(buffer), buffer.sampleRate) };
  },
};

setInterval(() => {
  status.textContent = `${view}${deck.live ? ' · live' : ''} · ${loaded() ? 'loaded' : 'loading'} · LCD ${lcdText(deck.state.lcd) || 'off'}${muted ? ' · muted' : ''}`;
}, 250);

// The live region's words on the console, so a check can wait for them without touching the page.
let said = '';
new MutationObserver(() => {
  const words = deck.controls.querySelector('.radio__announcer')?.textContent ?? '';
  if (words === said) return;
  said = words;
  if (words) console.info(`radio-lab: said "${words.trim()}"`);
}).observe(deck.controls, { subtree: true, childList: true, characterData: true });

if (params.get('view') === 'radio') fly(true);
const autoPick = params.get('pick');
if (autoPick) {
  const poll = window.setInterval(() => {
    if (!loaded()) return;
    window.clearInterval(poll);
    console.info(`radio-lab: picked without a gesture (user activation: ${navigator.userActivation?.hasBeenActive})`);
    deck.emitIntent({ type: 'pick', disc: autoPick });
  }, 50);
}

createRoot(byId('root')).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);

/** `?coarse=1`: answer the pointer media queries as a phone would, so the touch bar shows on a desktop. */
function emulateTouchScreen(): void {
  const native = window.matchMedia.bind(window);
  window.matchMedia = (query: string): MediaQueryList => {
    const touch = /\(pointer:\s*coarse\)|\(hover:\s*none\)/.test(query);
    const mouse = /\(pointer:\s*fine\)|\(hover:\s*hover\)/.test(query);
    if (!touch && !mouse) return native(query);
    const list = native(query);
    // A fixed answer that still behaves as a list (listeners are kept by the real one and never fire).
    return {
      matches: touch,
      media: query,
      onchange: null,
      addEventListener: list.addEventListener.bind(list),
      removeEventListener: list.removeEventListener.bind(list),
      addListener: list.addListener.bind(list),
      removeListener: list.removeListener.bind(list),
      dispatchEvent: list.dispatchEvent.bind(list),
    };
  };
}

function byId(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`radio-lab.html is missing #${id}`);
  return found;
}
