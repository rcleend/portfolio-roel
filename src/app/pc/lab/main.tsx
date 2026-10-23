import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { RoomView } from '@/room';
import { PcSlot } from '../PcSlot';
import { FakeDisplay, type LabEvent } from './FakeDisplay';
import '../../styles.css';

/**
 * PC lab (`/pc-lab.html`, development only): the computer's screen on a
 * stand-in monitor, without the room. `?w=&h=` sets the picture's size in
 * CSS px, `?tier=` the still's texture width, `?live=1` lands as soon as the
 * screen has loaded, `?clean` hides the panel and `?glass=0` the glass.
 * Clicking outside the monitor leaves, like the room. `window.__pcLab`
 * drives it from Playwright and records what the screen asked of the monitor.
 */
const params = new URLSearchParams(window.location.search);
if (params.has('clean')) document.body.classList.add('clean');
if (params.get('glass') === '0') document.body.classList.add('no-glass');

const overlay = byId('screens');
const still = byId('still') as HTMLCanvasElement;
const backdrop = byId('backdrop');
const status = byId('status');
const width = Number(params.get('w'));
const height = Number(params.get('h'));
const display = new FakeDisplay({
  overlay,
  still,
  size: width > 0 && height > 0 ? { width, height } : null,
  tier: Number(params.get('tier')) || null,
});

let view: RoomView = 'room';
const viewListeners = new Set<() => void>();
function setView(next: RoomView): void {
  view = next;
  for (const listener of viewListeners) listener();
}

function land(): void {
  setView('pc');
  display.reveal();
}

function leave(): void {
  display.conceal();
  setView('room');
}

function loaded(): boolean {
  return display.screen.querySelector('.pc-screen') !== null;
}

backdrop.addEventListener('pointerdown', leave);
byId('panel').addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).dataset.action;
  if (action === 'land') land();
  if (action === 'leave') leave();
  if (action === 'screen') document.body.classList.toggle('hide-screen');
  if (action === 'glass') document.body.classList.toggle('no-glass');
});

function Lab() {
  const current = useSyncExternalStore(
    (onChange) => {
      viewListeners.add(onChange);
      return () => viewListeners.delete(onChange);
    },
    () => view,
  );
  return (
    <PcSlot
      display={display}
      view={current}
      powered
      onLeave={() => {
        display.log({ type: 'leave' });
        leave();
      }}
      onFocusStage={() => {
        display.log({ type: 'focusStage' });
        backdrop.focus({ preventScroll: true });
      }}
    />
  );
}

declare global {
  interface Window {
    __pcLab?: {
      readonly display: FakeDisplay;
      readonly events: readonly LabEvent[];
      land(): void;
      leave(): void;
      loaded(): boolean;
      state(): string | undefined;
    };
  }
}
window.__pcLab = {
  display,
  events: display.events,
  land,
  leave,
  loaded,
  state: () => display.screen.querySelector<HTMLElement>('.pc-screen')?.dataset.pcState,
};

setInterval(() => {
  const { width: w, height: h } = display.placement;
  status.textContent = `${w} × ${h} · ${view} · ${window.__pcLab?.state() ?? 'loading'} · still ${display.painted ? 'painted' : 'standby'}`;
}, 250);

if (params.get('live') === '1') {
  const poll = window.setInterval(() => {
    if (!loaded()) return;
    window.clearInterval(poll);
    land();
  }, 50);
}

createRoot(byId('root')).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`pc-lab.html is missing #${id}`);
  return element;
}
