import { createRoom } from '../index';
import { MockGameSurface } from './MockGameSurface';
import { MockPcScreen } from './MockPcScreen';
import { MockRadioApp } from './MockRadioApp';

/**
 * Room lab: the attic room hosting a mock game, for developing and screenshotting the room
 * without the real game. `?clean` hides the panel; `?autopower=0` keeps the TV off;
 * `?view=pc` or `?view=radio` flies to the computer or the radio after power-on; `?mockpc=1` puts
 * a test card on the computer's still and live screen; `?mockradio=1` hands the radio five numbered
 * discs and a fake player that answers it like the app (and prepares the radio once the room is
 * ready). `window.__roomLab` exposes the room, surface and mock radio to Playwright.
 */
const params = new URLSearchParams(window.location.search);
if (params.has('clean')) document.body.classList.add('clean');

const container = document.getElementById('stage');
const screens = document.getElementById('screens');
const status = document.getElementById('status');
if (!container || !screens || !status) throw new Error('room-lab.html is missing #stage, #screens or #status');

const surface = new MockGameSurface();
const room = createRoom({
  container,
  overlayContainer: screens,
  surface,
  onProgress: (fraction) => {
    status.textContent = `loading ${Math.round(fraction * 100)}%`;
  },
});
if (params.get('mockpc') === '1') new MockPcScreen(room.pc);

const showStatus = (): void => {
  const stats = room.stats;
  status.textContent = [
    `view ${room.view}`,
    surface.paused ? 'paused' : 'running',
    `live ${room.pc.live}`,
    `frames ${stats.framesRendered}`,
    `${stats.drawCalls} calls`,
    `${stats.programs} programs`,
    `pc texture ${stats.pcTexturePixels} px`,
    `radio ${stats.radioReady ? 'ready' : 'cold'}${room.radio.deck?.live ? ' live' : ''}`,
    `lid ${stats.radioLidDegrees.toFixed(1)}°`,
    stats.radioAmbient ? 'ambient' : 'resting',
    `radio texture ${stats.radioTexturePixels} px`,
    `dpr ${stats.pixelRatio.toFixed(2)}`,
  ].join(' · ');
};
room.onViewChange(showStatus);
room.pc.onLiveChange(showStatus);
setInterval(showStatus, 500);

document.getElementById('panel')?.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).dataset.action;
  if (action === 'power') void room.powerOn().then(() => surface.resume());
  if (action === 'tv') room.focusTv();
  if (action === 'room') room.showRoom();
  if (action === 'pc') room.focusPc();
  if (action === 'radio') room.focusRadio();
  if (action === 'play') lab.radio?.press('play-pause');
  if (action === 'stop') lab.radio?.press('stop');
  if (action === 'next') lab.radio?.press('next');
});

declare global {
  interface Window {
    __roomLab?: { room: typeof room; surface: MockGameSurface; radio: MockRadioApp | null };
  }
}
/** The mock radio arrives with the radio's deck, once the room is ready. */
const lab: { room: typeof room; surface: MockGameSurface; radio: MockRadioApp | null } = { room, surface, radio: null };
window.__roomLab = lab;

room.ready.then(
  async () => {
    showStatus();
    const deck = params.get('mockradio') === '1' ? await room.radio.load().catch(() => null) : null;
    if (deck) {
      lab.radio = new MockRadioApp(deck);
      deck.onLiveChange(showStatus);
      lab.radio.setDiscs();
      room.radio.prefetch('idle');
    }
    if (params.get('autopower') === '0') return;
    await room.powerOn();
    surface.resume();
    if (params.get('view') === 'pc') room.focusPc();
    if (params.get('view') === 'radio') room.focusRadio();
  },
  (error: unknown) => {
    status.textContent = `failed: ${error instanceof Error ? error.message : String(error)}`;
  },
);
