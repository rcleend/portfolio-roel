import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { pointerKind, showGameCursor } from '../cursors/gameCursor';
import { integerScale, toNativePixels } from './integerScale';
import type { HostProps } from './types';
import './FlatHost.css';

/**
 * The WebGL-free host: the native canvas at the largest integer zoom, inside
 * a CSS television with scanlines and vignette. Keyboard and gamepad reach
 * the game only while the screen has focus. The tube stays dark until
 * `powered`, then runs a CSS power-on (line, snap open, bloom) before telling
 * the app to start the game. There is no room, so no radio: `muted` is unused.
 */
export function FlatHost({ surface, powered, insets, events }: HostProps) {
  const screenRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() => fitScale(surface, insets));
  const [lit, setLit] = useState(false);
  const ready = useEffectEvent(() => events.onReady('flat'));
  const poweredOn = useEffectEvent(() => events.onPoweredOn());

  useLayoutEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const { canvas } = surface;
    canvas.className = 'tv__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    screen.prepend(canvas);
    screen.focus({ preventScroll: true });
    // Sync explicitly: when the screen already had focus (e.g. a StrictMode re-mount) no focus event fires.
    surface.setInputEnabled(document.activeElement === screen);
    // Over a level's play the game names what a click would do there; the hand everywhere else.
    showGameCursor(screen, surface.cursor);
    const stopCursor = surface.onCursorChange((cursor) => showGameCursor(screen, cursor));
    return () => {
      stopCursor();
      canvas.remove();
      surface.setInputEnabled(false);
    };
  }, [surface]);

  // Nothing to download: ready as soon as the canvas is in its frame.
  useEffect(() => ready(), []);

  const { top, right, bottom, left } = insets;
  useEffect(() => {
    const resize = (): void => setScale(fitScale(surface, { top, right, bottom, left }));
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [surface, top, right, bottom, left]);

  const sendPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = surface.canvas.getBoundingClientRect();
    const { x, y } = toNativePixels(event.clientX, event.clientY, rect, surface.width, surface.height);
    surface.pointer.move(x, y, pointerKind(event.pointerType));
  };

  // Scanlines are drawn per game row: the darker band is a whole number of CSS pixels at every zoom.
  const lineDark = Math.max(1, Math.round(scale / 3));
  const style = {
    '--screen-width': `${surface.width * scale}px`,
    '--screen-height': `${surface.height * scale}px`,
    '--row': `${scale}px`,
    '--row-dark': `${lineDark}px`,
    paddingTop: `${16 + top}px`,
    paddingRight: `${16 + right}px`,
    paddingBottom: `${16 + bottom}px`,
    paddingLeft: `${16 + left}px`,
  } as CSSProperties;

  return (
    <section className="flat-host" data-host="flat" data-view="tv" aria-label="Arcade game" style={style}>
      <div className="tv">
        <div
          ref={screenRef}
          className="tv__screen"
          role="application"
          aria-roledescription="arcade game"
          aria-label="Roel Leenders' portfolio as an arcade game. Use the arrow keys to move, Z or Space to jump and confirm, X to attack. The same content is in the résumé after this game."
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the screen is the game's keyboard focus target.
          tabIndex={0}
          onFocus={() => surface.setInputEnabled(true)}
          onBlur={() => surface.setInputEnabled(false)}
          onPointerMove={sendPointer}
          onPointerDown={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            sendPointer(event);
            surface.pointer.down(pointerKind(event.pointerType));
          }}
          onPointerUp={(event) => {
            sendPointer(event);
            surface.pointer.up();
          }}
          onPointerLeave={() => surface.pointer.leave()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="tv__scanlines" aria-hidden="true" />
          {lit ? null : (
            <div
              className={powered ? 'tv__tube tv__tube--powering' : 'tv__tube'}
              aria-hidden="true"
              onAnimationEnd={(event) => {
                // Only the tube's own sequence, not the raster's inner keyframes bubbling up.
                if (event.target !== event.currentTarget) return;
                setLit(true);
                poweredOn();
              }}
            >
              <div className="tv__raster" />
            </div>
          )}
          <div className="tv__glass" aria-hidden="true" />
        </div>
        <div className="tv__panel" aria-hidden="true">
          <span className="tv__brand">REO·LEO</span>
          <span className="tv__model">MVS-1996</span>
          <span className="tv__knobs">
            <span className="tv__knob" />
            <span className="tv__knob" />
          </span>
          <span className="tv__power">
            <span className={powered ? 'tv__led tv__led--on' : 'tv__led'} />
            POWER
          </span>
        </div>
      </div>
      <p className="flat-host__hint">
        Click the screen to play · Arrows move · Z / Space jump · X attack · Enter start
      </p>
    </section>
  );
}

/** Integer zoom for the viewport minus the strips overlays cover. */
function fitScale(surface: HostProps['surface'], insets: HostProps['insets']): number {
  return integerScale(
    window.innerWidth - insets.left - insets.right,
    window.innerHeight - insets.top - insets.bottom,
    surface.width,
    surface.height,
  );
}
