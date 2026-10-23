import { createRoom } from '../index';
import { MockGameSurface } from './MockGameSurface';

/**
 * Room lab: the attic room hosting a mock game, for developing and screenshotting the room
 * without the real game. `?clean` hides the panel; `?autopower=0` keeps the TV off.
 * `window.__roomLab` exposes the room and surface to Playwright.
 */
const params = new URLSearchParams(window.location.search);
if (params.has('clean')) document.body.classList.add('clean');

const container = document.getElementById('stage');
const status = document.getElementById('status');
if (!container || !status) throw new Error('room-lab.html is missing #stage or #status');

const surface = new MockGameSurface();
const room = createRoom({
  container,
  surface,
  onProgress: (fraction) => {
    status.textContent = `loading ${Math.round(fraction * 100)}%`;
  },
});

const showStatus = (): void => {
  const stats = room.stats;
  status.textContent = `view ${room.view} · ${surface.paused ? 'paused' : 'running'} · frames ${stats.framesRendered} · ${stats.drawCalls} calls · dpr ${stats.pixelRatio.toFixed(2)}`;
};
room.onViewChange(showStatus);
setInterval(showStatus, 500);

document.getElementById('panel')?.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).dataset.action;
  if (action === 'power') void room.powerOn().then(() => surface.resume());
  if (action === 'tv') room.focusTv();
  if (action === 'room') room.showRoom();
});

declare global {
  interface Window {
    __roomLab?: { room: typeof room; surface: MockGameSurface };
  }
}
window.__roomLab = { room, surface };

room.ready.then(
  async () => {
    showStatus();
    if (params.get('autopower') === '0') return;
    await room.powerOn();
    surface.resume();
  },
  (error: unknown) => {
    status.textContent = `failed: ${error instanceof Error ? error.message : String(error)}`;
  },
);
