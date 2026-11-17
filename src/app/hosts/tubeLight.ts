import type { GameSurface } from '@/engine/core/GameSurface';

/** No more often than this: the room's own light follows every frame on the GPU, the still's is read back. */
const EVERY_MS = 80;

/** sRGB bytes as linear light. */
const LINEAR = Float32Array.from({ length: 256 }, (_, byte) => {
  const v = byte / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

/**
 * What the still's drawing makes of the light: it adds `--tube` to its dark paints on the display's own scale, where
 * the room adds light, and a uniform picture p lights the room's lip as that sum does with p to this power (measured
 * by the still's build on the live room, scripts/still; white stays white).
 */
const CURVE = 1.45;

/**
 * The mean colour of RGBA pixels as the light they give the still: averaged as linear light, the way the room's tube
 * lights its surroundings from the picture's smallest mip (room/tv/screenLight.ts), written for the display and
 * bent to the still's own response.
 */
export function meanLight(data: ArrayLike<number>): string {
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4)
    for (let c = 0; c < 3; c++) sum[c] = (sum[c] as number) + (LINEAR[data[i + c] as number] as number);
  const channels = sum.map((total) => {
    const v = total / (data.length / 4);
    return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) ** CURVE);
  });
  return `rgb(${channels.join(' ')})`;
}

/**
 * Lights the startup still from the game's picture as the room is lit from it (docs/ROOM.md › Startup): `--tube` on
 * `still` is the picture's mean light, which the still's drawing colours everything the tube shines on with. Read
 * from a copy of the canvas a dozen times a second (every pixel: the game's dithered grounds alias with any coarser
 * grid, by six levels on the title), and never on a black frame, which needs no reading: the hand-over happens on
 * one, with the still's light already out. Returns a function that stops it.
 */
export function followTube(surface: GameSurface, dark: () => boolean, still: HTMLElement): () => void {
  const probe = document.createElement('canvas');
  const { width, height } = surface;
  probe.width = width;
  probe.height = height;
  // CPU-backed: it is read every time it is drawn.
  const context = probe.getContext('2d', { willReadFrequently: true });
  let last = 0;
  let light = '';
  return surface.onFrame(() => {
    let next = '#000';
    if (!dark()) {
      const now = performance.now();
      if (!context || now - last < EVERY_MS) return;
      last = now;
      context.drawImage(surface.canvas, 0, 0);
      next = meanLight(context.getImageData(0, 0, width, height).data);
    }
    if (next !== light) still.style.setProperty('--tube', next);
    light = next;
  });
}
