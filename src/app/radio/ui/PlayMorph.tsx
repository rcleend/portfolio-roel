import { useLayoutEffect, useRef } from 'react';
import { jelly } from '../../motion/jelly';

/**
 * The radio's play/pause glyph that morphs rather than swaps (round seven, item 42): a soft, rounded play triangle
 * whose two halves melt into the two rounded pause bars and back, on a spring that overshoots a little. Each half is
 * a four-point shape with the same points in both glyphs, so the morph is a straight interpolation of eight points;
 * the round line joins of a stroke in the fill's colour give every corner its radius. One `d` per frame while it
 * moves (no layout, no paint beyond the glyph), nothing at rest. Under reduced motion it changes at once.
 */

type Shape = readonly (readonly [number, number])[];

/** The play triangle (36-unit box), cut in two down its middle: its left half and its tip. */
const PLAY: readonly [Shape, Shape] = [
  [
    [11.5, 9],
    [19.5, 13.5],
    [19.5, 22.5],
    [11.5, 27],
  ],
  [
    [19.5, 13.5],
    [27.5, 18],
    [27.5, 18],
    [19.5, 22.5],
  ],
];

/** The pause bars, point for point. */
const PAUSE: readonly [Shape, Shape] = [
  [
    [10.5, 9.5],
    [15, 9.5],
    [15, 26.5],
    [10.5, 26.5],
  ],
  [
    [21, 9.5],
    [25.5, 9.5],
    [25.5, 26.5],
    [21, 26.5],
  ],
];

/** A spring a little under critical damping: it overshoots about 10 % and settles in about 450 ms. */
const STIFFNESS = 420;
const DAMPING = 21;

function path(t: number, half: 0 | 1): string {
  const from = PLAY[half];
  const to = PAUSE[half];
  return `${from
    .map(([x, y], i) => {
      const [x2, y2] = to[i] ?? [x, y];
      return `${i === 0 ? 'M' : 'L'}${(x + (x2 - x) * t).toFixed(2)} ${(y + (y2 - y) * t).toFixed(2)}`;
    })
    .join('')}Z`;
}

export function PlayMorph({ playing, reduced }: { readonly playing: boolean; readonly reduced: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const halves = useRef<(SVGPathElement | null)[]>([]);
  const state = useRef({ t: playing ? 1 : 0, velocity: 0, frame: 0, first: true });

  useLayoutEffect(() => {
    const motion = state.current;
    const target = playing ? 1 : 0;
    const draw = (): void => {
      halves.current[0]?.setAttribute('d', path(motion.t, 0));
      halves.current[1]?.setAttribute('d', path(motion.t, 1));
    };
    cancelAnimationFrame(motion.frame);
    if (reduced || motion.first) {
      motion.first = false;
      motion.t = target;
      motion.velocity = 0;
      draw();
      return;
    }
    // The whole glyph wobbles like jelly as it changes, squashed one way and then the other.
    jelly(svg.current);
    let last = performance.now();
    const step = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const force = -STIFFNESS * (motion.t - target) - DAMPING * motion.velocity;
      motion.velocity += force * dt;
      motion.t += motion.velocity * dt;
      const done = Math.abs(motion.t - target) < 0.001 && Math.abs(motion.velocity) < 0.01;
      if (done) motion.t = target;
      draw();
      if (!done) motion.frame = requestAnimationFrame(step);
    };
    motion.frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(motion.frame);
  }, [playing, reduced]);

  return (
    <svg ref={svg} className="radio-bar__morph" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      {([0, 1] as const).map((half) => (
        <path
          key={half}
          ref={(element) => {
            halves.current[half] = element;
          }}
          d={path(playing ? 1 : 0, half)}
        />
      ))}
    </svg>
  );
}
