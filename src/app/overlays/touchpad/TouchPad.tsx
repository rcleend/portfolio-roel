import { type MouseEvent, type PointerEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { PadPresses } from './PadPresses';
import type { PadActionMap, PadButtonId, PadDirection } from './padActions';
import {
  BUTTON_SIZE,
  type ButtonLetter,
  buttonArt,
  DPAD_SIZE,
  dpadArt,
  letterArt,
  START_SIZE,
  startArt,
} from './padArt';
import type { Insets } from './padGeometry';
import { dpadDirections, hitsButton, hitsRect, NO_INSETS, type PadLayout, padInsets } from './padGeometry';
import './TouchPad.css';

export interface TouchPadProps<A extends string> {
  readonly actions: PadActionMap<A>;
  /** The game's virtual buttons. */
  readonly sink: { press(action: A): void; release(action: A): void };
  /** Shown only while the visitor is at the TV; hidden, it lets go of everything. */
  readonly visible: boolean;
  readonly layout: PadLayout;
  onInsetsChange(insets: Insets): void;
}

type ControlKey = PadButtonId | `dpad-${PadDirection}`;

interface FaceButton {
  readonly id: Exclude<PadButtonId, 'start'>;
  /** The gamepad button it stands in for (padActions.ts), printed on it so the four read apart without colour. */
  readonly letter: ButtonLetter;
  readonly tone: string;
}

/** Neo Geo colours, gamepad letters: jump the red A, attack the yellow X, the skills the green Y and the blue B. */
const FACE_BUTTONS: readonly FaceButton[] = [
  { id: 'jump', letter: 'A', tone: 'red' },
  { id: 'attack', letter: 'X', tone: 'yellow' },
  { id: 'skill1', letter: 'Y', tone: 'green' },
  { id: 'skill2', letter: 'B', tone: 'blue' },
];

const DIRECTIONS: readonly PadDirection[] = ['up', 'down', 'left', 'right'];

/**
 * On-screen arcade controls for touch devices. Every finger is tracked on
 * its own and may slide between controls (rolling from JUMP onto ATTACK, or
 * round the D-pad), the way thumbs move on a real pad. Presses go to the
 * game's virtual buttons with the same meaning as a gamepad's buttons.
 *
 * Hidden from assistive tech: it duplicates the keyboard controls for
 * fingers only.
 */
export function TouchPad<A extends string>({ actions, sink, visible, layout, onInsetsChange }: TouchPadProps<A>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const presses = useMemo(() => new PadPresses<A>(sink), [sink]);
  const fingers = useRef(new Map<number, readonly ControlKey[]>());
  const [held, setHeld] = useState<ReadonlySet<ControlKey>>(() => new Set());
  const reportInsets = useEffectEvent(onInsetsChange);

  const syncHeld = (): void => setHeld(new Set([...fingers.current.values()].flat()));

  useEffect(() => {
    if (visible) return;
    fingers.current.clear();
    presses.clear();
    setHeld(new Set());
  }, [visible, presses]);
  useEffect(() => () => presses.clear(), [presses]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let last = NO_INSETS;
    const measure = (): void => {
      const clusters = [...root.querySelectorAll<HTMLElement>('[data-cluster]')].map((el) =>
        el.getBoundingClientRect(),
      );
      const next = padInsets(layout, { width: window.innerWidth, height: window.innerHeight }, clusters);
      if (next.top === last.top && next.right === last.right && next.bottom === last.bottom && next.left === last.left)
        return;
      last = next;
      reportInsets(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      reportInsets(NO_INSETS);
    };
  }, [layout]);

  const controlsAt = (x: number, y: number): ControlKey[] => {
    const root = rootRef.current;
    if (!root) return [];
    const found: ControlKey[] = [];
    for (const element of root.querySelectorAll<SVGSVGElement>('[data-control]')) {
      const rect = element.getBoundingClientRect();
      const control = element.dataset.control;
      if (control === 'dpad') {
        for (const direction of dpadDirections(rect, x, y)) found.push(`dpad-${direction}`);
      } else if (control === 'start' ? hitsRect(rect, x, y) : isButtonId(control) && hitsButton(rect, x, y)) {
        found.push(control as PadButtonId);
      }
    }
    return found;
  };

  const actionsOf = (controls: readonly ControlKey[]): A[] =>
    controls.flatMap((control) =>
      control.startsWith('dpad-')
        ? actions.directions[control.slice(5) as PadDirection]
        : actions.buttons[control as PadButtonId],
    );

  const track = (event: PointerEvent<HTMLElement>): void => {
    const controls = controlsAt(event.clientX, event.clientY);
    fingers.current.set(event.pointerId, controls);
    const pressed = presses.set(event.pointerId, actionsOf(controls));
    // A short tick on Android when a control goes down; iOS has no vibration API and ignores it.
    if (pressed.length > 0) navigator.vibrate?.(8);
    syncHeld();
  };

  const lift = (event: PointerEvent<HTMLElement>): void => {
    if (!fingers.current.delete(event.pointerId)) return;
    presses.delete(event.pointerId);
    syncHeld();
  };

  const clusterHandlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      // Keep focus and selection where they are, and own this finger until it lifts.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      track(event);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (fingers.current.has(event.pointerId)) track(event);
    },
    onPointerUp: lift,
    onPointerCancel: lift,
    onLostPointerCapture: lift,
    onContextMenu: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
  };

  return (
    <div
      ref={rootRef}
      className={`touchpad touchpad--${layout}`}
      data-visible={visible ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div className="touchpad__cluster touchpad__cluster--dpad" data-cluster {...clusterHandlers}>
        <svg
          className="touchpad__dpad"
          data-control="dpad"
          viewBox={`0 0 ${DPAD_SIZE + 2} ${DPAD_SIZE + 2}`}
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <path className="pad-shadow" d={dpadArt.shadow} />
          <path className="pad-outline" d={dpadArt.outline} />
          <path className="dpad-body" d={dpadArt.body} />
          {DIRECTIONS.map((direction) =>
            held.has(`dpad-${direction}`) ? (
              <path key={direction} className="dpad-arm--held" d={dpadArt.arms[direction]} />
            ) : null,
          )}
          <path className="dpad-highlight" d={dpadArt.highlight} />
          <path className="dpad-shade" d={dpadArt.shade} />
          <path className="dpad-dimple" d={dpadArt.dimple} />
          {DIRECTIONS.map((direction) => (
            <path
              key={direction}
              className={held.has(`dpad-${direction}`) ? 'dpad-arrow dpad-arrow--held' : 'dpad-arrow'}
              d={dpadArt.arrows[direction]}
            />
          ))}
        </svg>
      </div>

      <div className="touchpad__cluster touchpad__cluster--buttons" data-cluster {...clusterHandlers}>
        {FACE_BUTTONS.map((button) => (
          <div key={button.id} className={`pad-button pad-button--${button.id}`}>
            <svg
              className={`pad-button__cap tone--${button.tone}`}
              data-control={button.id}
              data-held={held.has(button.id) ? 'true' : 'false'}
              viewBox={`0 0 ${BUTTON_SIZE} ${BUTTON_SIZE + 1}`}
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <path className="pad-outline" d={buttonArt.ring} />
              {held.has(button.id) ? (
                <path className="cap-face cap-face--held" d={buttonArt.pressedFace} />
              ) : (
                <>
                  <path className="cap-face" d={buttonArt.face} />
                  <path className="cap-shade" d={buttonArt.shade} />
                  <path className="cap-highlight" d={buttonArt.highlight} />
                  <path className="cap-glint" d={buttonArt.glint} />
                </>
              )}
              <path className="cap-letter" d={letterArt[button.letter][held.has(button.id) ? 'held' : 'up']} />
            </svg>
          </div>
        ))}
      </div>

      <div className="touchpad__cluster touchpad__cluster--start" data-cluster {...clusterHandlers}>
        <svg
          className="pad-start"
          data-control="start"
          data-held={held.has('start') ? 'true' : 'false'}
          viewBox={`-1 -1 ${START_SIZE.w + 2} ${START_SIZE.h + 2}`}
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <path className="pad-shadow" d={startArt.shadow} />
          <path className="pad-outline" d={startArt.outline} transform="translate(-1 -1)" />
          <path className="start-body" d={held.has('start') ? startArt.pressed : startArt.body} />
          {held.has('start') ? null : <path className="start-highlight" d={startArt.highlight} />}
        </svg>
        <span className="pad-label">Start</span>
      </div>
    </div>
  );
}

function isButtonId(value: string | undefined): value is PadButtonId {
  return value === 'jump' || value === 'attack' || value === 'skill1' || value === 'skill2' || value === 'start';
}
