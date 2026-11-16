import type { Room } from '@/room';

/**
 * The quality the room draws at and the frames it draws a second, in a corner of the page (`?debug=perf`): the one way to read
 * them on a phone, where the quality governor (docs/ROOM.md › Quality) matters most.
 */
export function showPerformance(room: Room): () => void {
  const readout = document.createElement('output');
  readout.style.cssText =
    'position:fixed;left:0;top:0;z-index:99;padding:2px 6px;font:11px monospace;color:#fff;background:#000a;pointer-events:none';
  document.body.append(readout);
  let frames = room.stats.framesRendered;
  let at = performance.now();
  const timer = setInterval(() => {
    const { quality, pixelRatio, framesRendered } = room.stats;
    const now = performance.now();
    const fps = ((framesRendered - frames) / (now - at)) * 1000;
    frames = framesRendered;
    at = now;
    readout.textContent = `${quality.tier} ×${quality.scale} dpr ${pixelRatio.toFixed(2)} ${fps.toFixed(0)} fps`;
  }, 500);
  return () => {
    clearInterval(timer);
    readout.remove();
  };
}
