import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  NearestFilter,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
} from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import { onCanvasRestored } from '../stage/canvasRestore';
import { FramePacer, GAME_FRAME_INTERVAL_MS } from '../stage/FramePacer';
import type { RenderLoop } from '../stage/RenderLoop';
import { CRT_FRAGMENT_SHADER, CRT_VERTEX_SHADER, type CrtUniforms, createCrtUniforms } from './crtShader';
import { createPauseOsd, paintPauseOsd } from './osd';
import { type CrtPowerFrame, crtPowerFrame, type PowerState, powerDurationMs } from './powerTimeline';
import { fitContentRect, type UvRect } from './screenMapping';
import { TV_PICTURE_INSET, TV_SCREEN_APERTURE, type TvModel } from './tvModel';

/**
 * A game nobody has touched for this long (seconds of its own time: the radio's discs float as long after a touch)
 * is one a room at rest draws thirty times a second, every other of its frames; the first key, button or move of the
 * pointer over the picture has it shown frame by frame again, from that frame on.
 */
const UNWATCHED_SECONDS = 6;
const UNWATCHED_FRAMES = 30;

export interface CrtScreenOptions {
  readonly tv: TvModel;
  readonly surface: GameSurface;
  readonly loop: RenderLoop;
  readonly reducedMotion: MediaQueryList;
}

/**
 * Presents the game canvas on the TV's glass through the CRT shader and runs the tube's
 * power sequence. The picture texture is re-uploaded only when the game reports a new frame.
 */
export class CrtScreen {
  /** The game picture as a texture (with mipmaps, which the room glow samples). */
  readonly picture: CanvasTexture;
  /** Where the 4:3 picture sits in screen-mesh UV space. */
  readonly contentRect: UvRect;

  private readonly osd: CanvasTexture;
  private readonly material: ShaderMaterial;
  private readonly uniforms: CrtUniforms;
  private readonly originalMaterial: Material | Material[];
  private readonly unsubscribeFrame: () => void;
  private readonly stopUnwatched: () => void;
  private readonly pacer: FramePacer;
  private power: PowerState = 'off';
  private powerFrame: CrtPowerFrame = crtPowerFrame('off', 0, false);
  private stopPowerAnimation: (() => void) | null = null;
  private settlePower: (() => void) | null = null;
  private pendingPower: Promise<void> | null = null;
  private readonly stopOsdRestore: () => void;

  constructor(private readonly options: CrtScreenOptions) {
    const { tv, surface, loop } = options;
    this.contentRect = fitContentRect(
      TV_SCREEN_APERTURE,
      tv.screenAspect,
      surface.width / surface.height,
      TV_PICTURE_INSET,
    );

    this.picture = new CanvasTexture(surface.canvas);
    this.picture.colorSpace = SRGBColorSpace;
    // The glass's UVs put v = 0 at the top, which is also the canvas's first row.
    this.picture.flipY = false;
    this.picture.magFilter = LinearFilter;
    this.picture.minFilter = LinearMipmapLinearFilter;
    this.picture.generateMipmaps = true;

    const osd = createPauseOsd(surface.width, surface.height);
    this.osd = new CanvasTexture(osd);
    this.osd.colorSpace = SRGBColorSpace;
    this.osd.flipY = false;
    this.osd.magFilter = NearestFilter;
    this.osd.minFilter = NearestFilter;
    this.osd.generateMipmaps = false;
    // Painted once: a GPU reset gives the canvas back blank, and a paused game's TV lost its PAUSE for good.
    this.stopOsdRestore = onCanvasRestored(osd, () => {
      paintPauseOsd(osd);
      this.osd.needsUpdate = true;
      loop.invalidate();
    });

    this.uniforms = createCrtUniforms(this.contentRect, new Vector2(surface.width, surface.height));
    this.uniforms.uPicture.value = this.picture;
    this.uniforms.uOsd.value = this.osd;
    this.material = new ShaderMaterial({
      name: 'CRT screen',
      uniforms: this.uniforms,
      vertexShader: CRT_VERTEX_SHADER,
      fragmentShader: CRT_FRAGMENT_SHADER,
    });
    this.originalMaterial = tv.screen.material;
    tv.screen.material = this.material;
    this.applyPowerFrame();

    // The OSD follows the game's paused flag at draw time; GameSurface has no pause event.
    tv.screen.onBeforeRender = () => {
      this.uniforms.uOsdOpacity.value = this.power === 'on' && surface.paused ? 1 : 0;
    };

    // The game's frames come as fast as the device draws them: their intervals measure it (stage/quality.ts).
    this.pacer = new FramePacer(GAME_FRAME_INTERVAL_MS, () => loop.invalidate(true));
    // A game somebody plays is shown frame by frame. One nobody has touched for a while (the title going round) is
    // shown as often as a room at rest draws for it, its latest picture each time (docs/ROOM.md › Frames › At rest).
    this.unsubscribeFrame = surface.onFrame(() => {
      this.picture.needsUpdate = true;
      if (!this.unwatched) this.pacer.frame();
    });
    this.stopUnwatched = loop.ambient('tv', () => (this.unwatched ? UNWATCHED_FRAMES : 0));
  }

  get powerState(): PowerState {
    return this.power;
  }

  /** The game runs on the tube and the visitor has not touched it for a while. */
  private get unwatched(): boolean {
    const { surface } = this.options;
    return this.power === 'on' && !surface.paused && surface.untouched >= UNWATCHED_SECONDS;
  }

  /** 0–1 light output of the tube right now. */
  get lit(): number {
    return this.powerFrame.lit;
  }

  setPixelRatio(pixelRatio: number): void {
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  /** Runs the power-on sequence; resolves once the picture is fully up. `instant`: up at once, with no sequence. */
  powerOn(instant = false): Promise<void> {
    if (instant) {
      this.stopPowerAnimation?.();
      this.settlePower?.();
      this.stopPowerAnimation = null;
      this.settlePower = null;
      this.pendingPower = null;
      this.setPower('on');
      return Promise.resolve();
    }
    return this.transition('powering-on', 'on');
  }

  /** Runs the power-off sequence; resolves once the tube is dark. */
  powerOff(): Promise<void> {
    return this.transition('powering-off', 'off');
  }

  dispose(): void {
    this.stopPowerAnimation?.();
    this.settlePower?.();
    this.unsubscribeFrame();
    this.stopUnwatched();
    this.stopOsdRestore();
    this.pacer.dispose();
    this.options.tv.screen.material = this.originalMaterial;
    this.options.tv.screen.onBeforeRender = () => {};
    this.material.dispose();
    this.picture.dispose();
    this.osd.dispose();
  }

  private transition(running: 'powering-on' | 'powering-off', settled: 'on' | 'off'): Promise<void> {
    if (this.power === settled) return Promise.resolve();
    if (this.power === running && this.pendingPower) return this.pendingPower;
    this.stopPowerAnimation?.();
    this.settlePower?.();
    this.setPower(running);
    const reduced = this.options.reducedMotion.matches;
    const duration = powerDurationMs(running, reduced);
    this.pendingPower = new Promise((resolve) => {
      this.settlePower = resolve;
      let start: number | null = null;
      this.stopPowerAnimation = this.options.loop.animate((now) => {
        // The timeline starts on the first drawn frame, so a busy main thread cannot
        // swallow the dot and line phases.
        start ??= now;
        const elapsed = now - start;
        this.powerFrame = crtPowerFrame(running, elapsed, reduced);
        this.applyPowerFrame();
        if (elapsed < duration) return true;
        this.stopPowerAnimation = null;
        this.settlePower = null;
        this.pendingPower = null;
        this.setPower(settled);
        resolve();
        return false;
      });
    });
    return this.pendingPower;
  }

  private setPower(state: PowerState): void {
    this.power = state;
    if (state === 'on' || state === 'off') {
      this.powerFrame = crtPowerFrame(state, 0, false);
      this.applyPowerFrame();
    }
    this.options.loop.invalidate();
  }

  private applyPowerFrame(): void {
    const frame = this.powerFrame;
    this.uniforms.uDeflection.value.set(frame.scaleX, frame.scaleY);
    this.uniforms.uBrightness.value = frame.brightness;
    this.uniforms.uFlash.value = frame.flash;
    this.uniforms.uRoll.value = frame.roll;
  }
}
