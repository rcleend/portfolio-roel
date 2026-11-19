import type { Room } from '@/room';

/**
 * What the room draws at and how its flights went, in a corner of the page (`?debug=perf`): the one way to read them
 * on a phone, where the quality governor (docs/ROOM.md › Quality) and a capped display (Safari in Low Power Mode)
 * matter most. Three lines, made to be read off one screenshot:
 *
 *   medium ×1 dpr 2.00 · 30 fps · display 30/s capped · 0 changes
 *   resting: 30/s for air, lava
 *   flight tv→room: 33 frames, 0 late, worst 34 ms
 *
 * The tier, scale and pixel ratio; the frames drawn in the last half second; the rate the page takes the display to
 * hand out frames at, and whether it takes that for a cap; how often the quality has changed (each change is a
 * resize). Then what the room draws of its own accord (docs/ROOM.md › Frames › At rest): `resting` and what moves,
 * `still` when nothing does, or `not resting` and why (the room is still being lit, its quality is being judged);
 * `+ asked` when more frames were drawn than that, which is the game, a flight or the pointer asking for them. Then
 * the last flight: its frames, how many came more than one and a half of the display's frames after the one before,
 * and the longest interval. Its own chunk, fetched only with `?debug=perf`: the flights are timed here,
 * from the frames the room says it drew, and cost a page without it nothing.
 */
export function showPerformance(room: Room): () => void {
  const readout = document.createElement('output');
  readout.style.cssText =
    'position:fixed;left:0;top:0;z-index:99;padding:2px 6px;font:11px monospace;color:#fff;background:#000a;pointer-events:none;white-space:pre';
  document.body.append(readout);
  let frames = room.stats.framesRendered;
  let at = performance.now();
  let flight = '';

  // A flight's frames: the display frames in which the room drew, from the camera setting off to its landing.
  let from = room.view;
  let recording: { readonly label: string; readonly times: number[]; drawn: number } | null = null;
  let handle = 0;
  const watch = (now: number): void => {
    if (!recording) return;
    const drawn = room.stats.framesRendered;
    if (drawn !== recording.drawn) recording.times.push(now);
    recording.drawn = drawn;
    handle = requestAnimationFrame(watch);
  };
  const stopChange = room.onViewChange((view) => {
    recording = { label: `${from}→${view}`, times: [], drawn: room.stats.framesRendered };
    from = view;
    cancelAnimationFrame(handle);
    handle = requestAnimationFrame(watch);
  });
  const stopSettle = room.onSettle(() => {
    const flown = recording;
    recording = null;
    if (!flown) return;
    const intervals = flown.times.slice(1).map((time, i) => time - (flown.times[i] ?? time));
    const late = intervals.filter((interval) => interval > 1.5 * room.stats.display.frameMs).length;
    flight = `\nflight ${flown.label}: ${intervals.length} frames, ${late} late, worst ${Math.round(Math.max(0, ...intervals))} ms`;
  });

  const timer = setInterval(() => {
    const { quality, pixelRatio, framesRendered, display, qualityChanges, pace } = room.stats;
    const now = performance.now();
    const fps = ((framesRendered - frames) / (now - at)) * 1000;
    frames = framesRendered;
    at = now;
    const own =
      pace.pace === 'full'
        ? `not resting: ${pace.why || 'every frame'}`
        : pace.pace === 'rest'
          ? `resting: ${Math.round(pace.rate)}/s for ${pace.moving.join(', ')}`
          : `still: ${document.hidden ? 'hidden' : 'nothing moves'}`;
    // More frames than the room draws by itself: something asked for them.
    const asked = pace.pace !== 'full' && fps > pace.rate * 1.2 + 3 ? ' + asked' : '';
    readout.textContent =
      `${quality.tier} ×${quality.scale} dpr ${pixelRatio.toFixed(2)} · ${fps.toFixed(0)} fps · ` +
      `display ${Math.round(1000 / display.frameMs)}/s${display.capped ? ' capped' : ''} · ${qualityChanges} changes\n${own}${asked}${flight}`;
  }, 500);
  return () => {
    clearInterval(timer);
    cancelAnimationFrame(handle);
    stopChange();
    stopSettle();
    readout.remove();
  };
}
