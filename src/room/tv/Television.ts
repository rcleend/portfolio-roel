import { Box3, type Mesh, type Object3D, Vector3 } from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import { boxCorners } from '../camera/framing';
import type { RenderLoop } from '../stage/RenderLoop';
import { CrtScreen } from './CrtScreen';
import { PowerLed, type PowerLedPlacement } from './PowerLed';
import type { PowerState } from './powerTimeline';
import { type ScreenLightUniforms, screenLight } from './screenLight';
import type { UvRect } from './screenMapping';
import { pictureOutline } from './tvFraming';
import { TV_SCREEN_APERTURE, type TvModel } from './tvModel';

export interface TelevisionOptions {
  readonly model: TvModel;
  readonly surface: GameSurface;
  /** Where the power LED is added. */
  readonly scene: Object3D;
  readonly loop: RenderLoop;
  readonly reducedMotion: MediaQueryList;
}

/** The LED sits just left of the front-panel buttons, beside the POWER button. */
const LED_OFFSET_FROM_BUTTONS = new Vector3(-0.001, 0, -0.022);
/** The LED lights this long before the tube starts to glow. */
const LED_LEAD_MS = 140;

/**
 * The CRT television as one device: its screen, its power LED and the light its picture casts
 * into the room, switched on and off together.
 */
export class Television {
  private readonly crt: CrtScreen;
  /** The picture as an area light, published on the glass for the room's finish to light the room with. */
  private readonly light: ScreenLightUniforms;
  private readonly led: PowerLed;
  /** The power-on in progress, including the LED's lead before the tube reacts. */
  private startingUp: Promise<void> | null = null;

  constructor(private readonly options: TelevisionOptions) {
    const { model, surface, scene, loop, reducedMotion } = options;
    this.crt = new CrtScreen({ tv: model, surface, loop, reducedMotion });
    this.light = screenLight(
      pictureOutline(model.screen, this.crt.contentRect),
      model.facing,
      new Box3().setFromObject(model.screen),
      TV_SCREEN_APERTURE,
      Math.max(...boxCorners(model.bounds.min, model.bounds.max).map((corner) => corner.dot(model.facing))),
      surface.width,
      this.crt.picture,
    );
    model.screen.userData.screenLight = this.light;
    this.led = new PowerLed(scene, ledPlacement(model), loop);
  }

  /** Powering on from the moment the LED lights, before the tube itself reacts. */
  get powerState(): PowerState {
    return this.startingUp ? 'powering-on' : this.crt.powerState;
  }

  /** Where the game picture sits in screen-mesh UV space. */
  get contentRect(): UvRect {
    return this.crt.contentRect;
  }

  /**
   * LED first, then the CRT turn-on; resolves once the picture is up. `instant`: LED and picture at once, for a game
   * the page already showed on the startup still (docs/ROOM.md › Startup).
   */
  powerOn(instant = false): Promise<void> {
    if (instant) {
      this.led.set(true);
      return this.crt.powerOn(true);
    }
    if (this.crt.powerState !== 'off') return this.crt.powerOn();
    this.startingUp ??= (async () => {
      this.led.set(true);
      if (!this.options.reducedMotion.matches) await delay(LED_LEAD_MS);
      await this.crt.powerOn();
      this.startingUp = null;
    })();
    return this.startingUp;
  }

  async powerOff(): Promise<void> {
    await this.crt.powerOff();
    this.led.set(false);
  }

  setPixelRatio(pixelRatio: number): void {
    this.crt.setPixelRatio(pixelRatio);
  }

  /** Call after each drawn frame so the picture's light follows the tube's output. */
  syncGlow(): void {
    this.light.uScreenOptics.value.z = this.crt.lit;
  }

  dispose(): void {
    this.led.dispose();
    delete this.options.model.screen.userData.screenLight;
    this.crt.dispose();
  }
}

function ledPlacement(model: TvModel): PowerLedPlacement {
  const buttons: Mesh | null = model.frontButtons;
  if (buttons) {
    const box = new Box3().setFromObject(buttons);
    const position = new Vector3(box.min.x, (box.min.y + box.max.y) / 2, box.min.z).add(LED_OFFSET_FROM_BUTTONS);
    return { position, facing: model.facing };
  }
  // No button strip in the asset: bottom-left corner of the front panel.
  const { min } = model.bounds;
  return { position: new Vector3(min.x - 0.001, min.y + 0.06, min.z + 0.1), facing: model.facing };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
