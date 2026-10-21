import { type CSSProperties, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { integerScale, toNativePixels } from './integerScale';
import type { HostProps } from './types';
import './FlatHost.css';

/**
 * The WebGL-free host: the native canvas at the largest integer zoom, inside
 * a CSS television with scanlines and vignette. Keyboard and gamepad reach
 * the game only while the screen has focus.
 */
export function FlatHost({ surface }: HostProps) {
  const screenRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() =>
    integerScale(window.innerWidth, window.innerHeight, surface.width, surface.height),
  );

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
    return () => {
      canvas.remove();
      surface.setInputEnabled(false);
    };
  }, [surface]);

  useEffect(() => {
    const resize = (): void =>
      setScale(integerScale(window.innerWidth, window.innerHeight, surface.width, surface.height));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [surface]);

  const sendPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = surface.canvas.getBoundingClientRect();
    const { x, y } = toNativePixels(event.clientX, event.clientY, rect, surface.width, surface.height);
    surface.pointer.move(x, y);
  };

  // Scanlines are drawn per game row: the darker band is a whole number of CSS pixels at every zoom.
  const lineDark = Math.max(1, Math.round(scale / 3));
  const style = {
    '--screen-width': `${surface.width * scale}px`,
    '--screen-height': `${surface.height * scale}px`,
    '--row': `${scale}px`,
    '--row-dark': `${lineDark}px`,
  } as CSSProperties;

  return (
    <section className="flat-host" aria-label="Arcade game" style={style}>
      <div className="tv">
        <div
          ref={screenRef}
          className="tv__screen"
          role="application"
          aria-label="Roel Leenders' portfolio as an arcade game. Use the arrow keys to move, Z or Space to jump and confirm, X to attack. The same content is in the résumé after this game."
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the screen is the game's keyboard focus target.
          tabIndex={0}
          onFocus={() => surface.setInputEnabled(true)}
          onBlur={() => surface.setInputEnabled(false)}
          onPointerMove={sendPointer}
          onPointerDown={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            sendPointer(event);
            surface.pointer.down();
          }}
          onPointerUp={(event) => {
            sendPointer(event);
            surface.pointer.up();
          }}
          onPointerLeave={() => surface.pointer.leave()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="tv__scanlines" aria-hidden="true" />
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
            <span className="tv__led" />
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
