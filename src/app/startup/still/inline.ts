/**
 * The startup still's script, inlined into index.html right after `#tv-still` (scripts/stillPlugin.ts): it draws the
 * still for this viewport before the first paint, tells the app where the game's picture goes (`--picture-*`, which
 * `.still-picture` reads), and draws again when the window changes while the still is up or before it comes back.
 * Then it fetches the still's image, the surfaces as the room renders them, and lays it over the drawing's own
 * gradients once it is decoded; when the still has gone it lets go of everything it drew (docs/ROOM.md › Startup).
 */
import { STILL, STILL_IMAGE, STILL_IMAGE_SMALL, STILL_TEXTS } from './data';
import { drawStill } from './draw';

const still = document.getElementById('tv-still') as HTMLElement;
const coarse = matchMedia('(pointer:coarse)');
let drawn = '';
/**
 * A phone, as the room tells one for the tier it starts on (room/stage/quality.ts › startingTier, with RoomStage's
 * facts): a finger for a pointer and a screen under 600 CSS px across. Copied from there; keep the two alike.
 */
const phone = (): boolean => coarse.matches && Math.min(still.clientWidth, still.clientHeight) < 600;
/** Which of the still's two images this page takes: the small one on a phone. Said once: a window that changes keeps the image it has. */
const small = phone();
/** Whether this browser draws a field: a path to cut it to, a mask between its rows. */
const able =
  typeof CSS !== 'undefined' &&
  CSS.supports?.('clip-path', 'path("M0 0Z")') &&
  CSS.supports('-webkit-mask-image', 'linear-gradient(#000,#000)');

function clear(): void {
  // (Not `:scope`: an old browser without it would throw here.)
  for (const old of [...still.children]) if (/^(svg|i)$/i.test(old.tagName)) old.remove();
}

function draw(): void {
  // The room's own measure: its host fills the viewport as the still does (hosts/RoomHost.css).
  const [width, height] = [still.clientWidth, still.clientHeight];
  // A still that has gone (`data-gone`, app/startup/TvStill.tsx) holds nothing: its drawing and the image's layers
  // go, and it is drawn afresh if it is put back.
  if ('gone' in still.dataset) {
    clear();
    drawn = '';
    return;
  }
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
  const { svg, picture } = drawStill(
    STILL,
    STILL_TEXTS,
    width,
    height,
    {
      left: landscape ? pad('Left', 138) : 0,
      right: landscape ? pad('Right', 174) : 0,
      bottom: landscape ? 0 : pad('Bottom', 228),
    },
    undefined,
    // The room's buffer pixels a CSS pixel on the tier it starts on (room/stage/quality.ts): a phone's (a finger
    // for a pointer, under 600 px across) on the middle tier's 1.6 megapixels, anything else on the top tier's 3.
    Math.min(devicePixelRatio, 2, Math.sqrt((phone() ? 1.6e6 : 3e6) / (width * height))),
    small,
  );
  clear();
  // A browser that cannot cut a field to its outline or fade one row into the next would paint every field over the
  // whole page: there the still stays the page's plain dark, and only says where the picture goes.
  if (able) still.insertAdjacentHTML('afterbegin', svg);
  ['left', 'top', 'width', 'height'].forEach((name, i) => {
    still.style.setProperty(`--picture-${name}`, `${picture[i]}px`);
  });
}

draw();
addEventListener('resize', draw);
new MutationObserver(draw).observe(still, { attributes: true, attributeFilter: ['data-shown', 'data-gone'] });

// The image: asked for once the room is ready (RoomHost's `data-ready`), decoded off the paint's path, and shown by
// the page's own rule (index.html › [data-image]) from then on. AVIF, or WebP where that will not decode.
// Not sooner: on a slow link its bytes share the line with the app's and the room's, and asked for at once (low
// priority or not) it put the tube on 0.1-0.17 s later on Slow 4G; asked for at the room's readiness it costs nothing
// measurable and still lands seconds before the hand-over, which waits for the room (docs/ROOM.md › Startup). Until
// then the still shows its gradients, which the image eases in over. A page whose room never comes (no WebGL, the CV
// alone) never fetches it. Nothing of this may stop the page: a browser without `decode` or either format keeps the
// gradients.
if (able && STILL_IMAGE && 'decode' in Image.prototype) {
  /** Fetches and decodes the image in one format (a new element each time: Firefox does not decode a second address on one that failed). */
  const load = (ending: string): Promise<void> => {
    const image = new Image();
    (image as { fetchPriority?: string }).fetchPriority = 'low';
    image.src = `${small ? STILL_IMAGE_SMALL : STILL_IMAGE}.${ending}`;
    return image.decode().then(() => {
      still.style.setProperty('--p', `url(${image.src})`);
      still.dataset.image = '';
    });
  };
  const ready = new MutationObserver(() => {
    if (!document.querySelector('.room-host[data-ready="true"]')) return;
    ready.disconnect();
    load('avif').catch(() => load('webp').catch(() => {}));
  });
  ready.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready'] });
}
