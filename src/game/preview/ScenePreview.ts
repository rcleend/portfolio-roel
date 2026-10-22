import { NullAudio } from '@/engine/audio/NullAudio';
import { STEP_SECONDS } from '@/engine/core/FixedLoop';
import { context2d, createCanvas } from '@/engine/gfx/canvas';
import { Gfx } from '@/engine/gfx/Gfx';
import { InputSnapshot } from '@/engine/input/InputSnapshot';
import type { GameAudio, MusicId, SfxId } from '../audio/ids';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../createGame';
import type { Action } from '../input/bindings';
import type { GameResources } from '../resources';
import { createPreviewServices } from './createPreviewServices';
import { PreviewAudio } from './PreviewAudio';
import type { PreviewDirector, PreviewSpec, SceneRequest } from './PreviewDirector';

export interface ScenePreviewOptions {
  /** Loaded once per page and shared by every preview. */
  readonly resources: GameResources;
  readonly spec: PreviewSpec;
  readonly reducedMotion: boolean;
  /** Where the scene's sound goes; silent when left out. Give it to one preview at a time. */
  readonly audio?: GameAudio;
  /** Defaults to the preview canvas's own 2D context; injectable for headless tests. */
  readonly context?: CanvasRenderingContext2D;
}

/** Previews take no input: the scene sees nothing held and nothing pressed. */
const NO_INPUT = InputSnapshot.empty<Action>();

/**
 * One scene of the game running on its own native canvas, as the playground
 * shows it. It never runs by itself: whoever owns the clock moves it to
 * frame N, so any number of previews stay frame for frame in step. Every run
 * starts from fresh services with the same seed, so frame N always looks the
 * same; that is what makes seeking exact.
 */
export class ScenePreview {
  readonly canvas: HTMLCanvasElement;
  readonly #gfx: Gfx;
  readonly #options: ScenePreviewOptions;
  readonly #audio: PreviewAudio;
  #director: PreviewDirector;
  #frame = 0;

  /** Enters the scene at frame 0 without its opening sound effects: it is being shown, not started. */
  constructor(options: ScenePreviewOptions) {
    this.#options = options;
    this.canvas = createCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
    this.#gfx = new Gfx(options.context ?? context2d(this.canvas), SCREEN_WIDTH, SCREEN_HEIGHT);
    this.#audio = new PreviewAudio(options.audio ?? new NullAudio<MusicId, SfxId>());
    this.#director = this.#audio.catchUp(() => this.#enter());
  }

  /** Steps simulated since the scene was entered. */
  get frame(): number {
    return this.#frame;
  }

  /** Where the scene asked to go during this run; a preview never follows. */
  get requests(): readonly SceneRequest[] {
    return this.#director.requests;
  }

  /** Starts the scene over at frame 0 as if it had just been entered, opening sounds and all. */
  restart(): void {
    // The scene asks for its music on entry, and asking for the track already playing would not restart it.
    this.#audio.stopMusic();
    this.#director = this.#enter();
  }

  /** Plays on to `frame`, every cue on the way sounding as it comes; going back is a seek. */
  advanceTo(frame: number): void {
    if (frame < this.#frame) this.seek(frame);
    else while (this.#frame < frame) this.#step();
  }

  /**
   * Shows exactly `frame`: stepped forward from here, or re-run from a fresh
   * start to go back. Either way the scene has seen the same steps as if it
   * had played there, and the effects it passed on the way stay silent.
   */
  seek(frame: number): void {
    this.#audio.catchUp(() => {
      if (frame < this.#frame) this.#director = this.#enter();
      while (this.#frame < frame) this.#step();
    });
  }

  render(): void {
    this.#director.render(this.#gfx);
  }

  /** Stops the scene's music: a preview that goes away takes its sound with it. */
  dispose(): void {
    this.#audio.stopMusic();
  }

  #enter(): PreviewDirector {
    const { director } = createPreviewServices(this.#options.resources, {
      reducedMotion: this.#options.reducedMotion,
      audio: this.#audio,
    });
    this.#frame = 0;
    director.show(this.#options.spec);
    return director;
  }

  #step(): void {
    this.#director.update({ dt: STEP_SECONDS, frame: this.#frame, input: NO_INPUT });
    this.#frame++;
  }
}
