// @vitest-environment happy-dom
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Texture,
  type Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpotlight } from '../../spotlight/Spotlight';
import type { SpotlightHost } from '../../spotlight/spotlightContract';
import { spotlightKit } from '../../spotlight/spotlightKit';
import { LCD_BRIGHTNESS, Lcd, type LcdPlacement } from './Lcd';

/**
 * The display beside the room's spotlight (docs/ROOM.md › The CD player): the menu's Music item, and the first look
 * around the room, light the radio, which brightens its textured materials by writing each one's colour, taken as the
 * light came on, back on every frame until the light is out. The display's colour is its backlight: black while it is
 * off. A visitor who went to the radio while it was lit (through the menu, always) had the display light up under the
 * spotlight's hand: its warm-up was overwritten with the black taken before it, the last time as the light went out,
 * and nothing set the colour again. The display stayed black, lamp on, until the next time it went off and on.
 */

const PLACEMENT: LcdPlacement = { min: [-0.02, 0.01], max: [0.02, 0.02], z: 0.05, normal: [0, 0.2, 1] };

/** happy-dom has no 2D canvas. */
function blankContext(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    globalAlpha: 1,
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
  } as unknown as CanvasRenderingContext2D;
}

/** The room's loop, its frames run by hand: every step, then what follows a frame. */
function frames() {
  const steps = new Set<(now: number) => boolean>();
  const after = new Set<() => void>();
  let now = 0;
  const loop = {
    animate: (step: (now: number) => boolean) => {
      steps.add(step);
      return () => {
        steps.delete(step);
      };
    },
    invalidate: () => {},
  };
  const frame = (ms = 16): void => {
    now += ms;
    for (const step of [...steps]) if (!step(now)) steps.delete(step);
    for (const listener of after) listener();
  };
  return { loop, steps, after, frame };
}

describe('the LCD under the prop spotlight', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => blankContext());
  });
  afterEach(() => vi.restoreAllMocks());

  /** The radio as a spotlit prop, and its device (the display in it) built after the spotlight, as in the room. */
  function setup(reduced: boolean) {
    const { loop, steps, after, frame } = frames();
    const body = new Group();
    const shell = new Mesh(
      new BoxGeometry(0.4, 0.2, 0.2),
      new MeshBasicMaterial({ map: new Texture(), color: new Color(0.5, 0.5, 0.5) }),
    );
    body.add(shell);
    const device = new Group();
    const room = new Group();
    room.add(body);
    room.updateMatrixWorld(true);
    let made = false;
    const camera = new PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 0.2, 2);
    camera.updateMatrixWorld();
    const host: SpotlightHost = {
      kit: spotlightKit,
      renderer: {
        autoClear: true,
        info: { autoReset: true },
        getRenderTarget: () => null,
        setRenderTarget: () => {},
        compileAsync: () => new Promise<void>(() => {}),
        getDrawingBufferSize: (target: Vector2) => target.set(1600, 800),
        render: () => {},
      } as unknown as WebGLRenderer,
      camera,
      loop,
      props: [
        {
          target: 'radio',
          glow: [body],
          bounce: [body],
          pivot: new Vector3(0, -0.1, 0),
          top: new Vector3(0, 0.1, 0),
          joins: () => (made ? device : null),
        },
      ],
      reducedMotion: { matches: reduced } as MediaQueryList,
      size: () => ({ width: 800, height: 400, pixelRatio: 2 }),
      still: () => false,
      onRender: (listener) => {
        after.add(listener);
        return () => after.delete(listener);
      },
    };
    const spotlight = createSpotlight(host, () => {});
    // The device is made in idle time, the display off: black, hidden.
    const lcd = new Lcd(device, PLACEMENT, 100, 1, loop);
    room.add(device);
    room.updateMatrixWorld(true);
    made = true;
    const settle = (): void => {
      for (let i = 0; i < 400 && steps.size > 0; i++) frame();
    };
    return { spotlight, lcd, shell, frame, settle };
  }

  const brightness = (lcd: Lcd): number => lcd.mesh.material.color.r;

  it.each([
    ['its warm-up flicker', false],
    ['a cut (reduced motion)', true],
  ])(
    'stays lit when it lights by %s while the radio is in the spotlight, and the light then goes out',
    (_, reduced) => {
      const { spotlight, lcd, shell, frame, settle } = setup(reduced);
      expect(brightness(lcd)).toBe(0);
      // The menu's Music item takes the pointer: the radio lights, the display still off.
      spotlight.show('radio');
      for (let i = 0; i < 20; i++) frame();
      expect((shell.material as MeshBasicMaterial).color.r).toBeGreaterThan(0.5);
      // The click: the camera sets off, the display lights, and the menu lets go of the radio.
      lcd.show({ kind: 'no-disc' }, true, reduced);
      spotlight.show(null);
      settle();
      expect(lcd.mesh.visible).toBe(true);
      expect(brightness(lcd)).toBeCloseTo(LCD_BRIGHTNESS, 6);
      // The radio's own baked colour is back, as ever.
      expect((shell.material as MeshBasicMaterial).color.r).toBeCloseTo(0.5, 6);
    },
  );

  it('stays lit through a later spotlight on the radio, at its own brightness rather than a brightened one', () => {
    const { spotlight, lcd, frame, settle } = setup(true);
    lcd.show({ kind: 'no-disc' }, true, true);
    spotlight.show('radio');
    for (let i = 0; i < 20; i++) frame();
    expect(brightness(lcd)).toBeCloseTo(LCD_BRIGHTNESS, 6);
    spotlight.show(null);
    settle();
    expect(brightness(lcd)).toBeCloseTo(LCD_BRIGHTNESS, 6);
  });

  it('goes dark when it is switched off while the radio is in the spotlight', () => {
    const { spotlight, lcd, settle } = setup(true);
    lcd.show({ kind: 'no-disc' }, true, true);
    spotlight.show('radio');
    lcd.show({ kind: 'off' }, true, true);
    spotlight.show(null);
    settle();
    expect(lcd.mesh.visible).toBe(false);
    expect(brightness(lcd)).toBe(0);
  });
});
