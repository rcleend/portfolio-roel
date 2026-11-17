/**
 * The startup still's script, inlined into index.html right after `#tv-still` (scripts/stillPlugin.ts): it draws the
 * still for this viewport before the first paint, tells the app where the game's picture goes (`--picture-*`, which
 * `.still-picture` reads), and draws again when the window changes while the still is up or before it comes back
 * (docs/ROOM.md › Startup).
 */
import { STILL, STILL_TEXTS } from './data';
import { drawStill } from './draw';

const still = document.getElementById('tv-still') as HTMLElement;
const coarse = matchMedia('(pointer:coarse)');
let drawn = '';

function draw(): void {
  // The room's own measure: its host fills the viewport as the still does (hosts/RoomHost.css).
  const [width, height] = [still.clientWidth, still.clientHeight];
  // Only a still that is up is drawn, and once a size: one put back later (a lost WebGL context) as it returns.
  const size = `${width} ${height}`;
  if (still.dataset.shown === 'false' || drawn === size) return;
  drawn = size;
  const safe = getComputedStyle(still);
  // On a touch screen the pad's clusters keep the picture clear from the start (overlays/touchpad/TouchPad.css):
  // START's top in portrait, the d-pad's and the buttons' inner edges in landscape; the still's padding is the
  // display's safe area.
  const pad = (side: 'Left' | 'Right' | 'Bottom', reach: number): number =>
    coarse.matches ? Math.ceil(reach + (parseFloat(safe[`padding${side}`]) || 0)) : 0;
  const landscape = width >= height;
  const { svg, picture } = drawStill(STILL, STILL_TEXTS, width, height, {
    left: landscape ? pad('Left', 138) : 0,
    right: landscape ? pad('Right', 174) : 0,
    bottom: landscape ? 0 : pad('Bottom', 228),
  });
  still.querySelector('svg')?.remove();
  still.insertAdjacentHTML('afterbegin', svg);
  ['left', 'top', 'width', 'height'].forEach((name, i) => {
    still.style.setProperty(`--picture-${name}`, `${picture[i]}px`);
  });
}

draw();
addEventListener('resize', draw);
new MutationObserver(draw).observe(still, { attributes: true, attributeFilter: ['data-shown'] });
