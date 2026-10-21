import { getCharacter, getLevel, type LevelInfo } from '@/content';
import { fade, iris } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { clamp } from '@/engine/math/scalar';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import type { CharacterAnimation } from '../../art';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import type { GameScene, GameStep, LevelParams } from '../params';
import { drawStubBanner } from '../StubBanner';

const GROUND_Y = 200;
const SPEED = 90;

/**
 * STUB — replaced by the gameplay crew with the real side-scroller. Lets you
 * walk left/right and jump; confirm finishes the level with a sample result.
 */
export class LevelScene implements GameScene<LevelParams> {
  readonly #services: GameServices;
  #params: LevelParams | null = null;
  #time = 0;
  #x = 80;
  #y = GROUND_Y;
  #vy = 0;
  #facingLeft = false;
  #animation: CharacterAnimation = 'idle';
  #animationStart = 0;
  #leaving = false;

  constructor(services: GameServices) {
    this.#services = services;
  }

  enter(params: LevelParams): void {
    this.#params = params;
    this.#services.audio.playMusic(params.levelId === 'luna' ? 'level-luna' : 'level-scripe');
  }

  exit(): void {
    this.#services.audio.stopMusic();
  }

  update(step: GameStep): void {
    const params = this.#params;
    if (!params) return;
    this.#time += step.dt;
    const { input } = step;
    const direction = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    if (direction !== 0) this.#facingLeft = direction < 0;
    this.#x = clamp(this.#x + direction * SPEED * step.dt, 16, 304);
    const grounded = this.#y >= GROUND_Y;
    if (grounded && input.wasPressed('jump')) {
      this.#vy = -260;
      this.#services.audio.playSfx('jump');
    }
    this.#vy += 700 * step.dt;
    this.#y = Math.min(GROUND_Y, this.#y + this.#vy * step.dt);
    if (this.#y >= GROUND_Y) this.#vy = 0;

    const next: CharacterAnimation =
      this.#y < GROUND_Y ? (this.#vy < 0 ? 'jump' : 'fall') : direction !== 0 ? 'run' : 'idle';
    if (next !== this.#animation) {
      this.#animation = next;
      this.#animationStart = this.#time;
    }

    if (this.#leaving) return;
    // Z and Space both jump and confirm; only a confirm-only key (Enter, Start) finishes the stub level.
    if (input.wasPressed('confirm') && !input.wasPressed('jump')) this.#finish(params);
    else if (input.wasPressed('back')) {
      this.#leaving = true;
      this.#services.director.goTo('levelSelect', { focus: params.levelId }, fade());
    }
  }

  render(gfx: Gfx): void {
    const params = this.#params;
    if (!params) return;
    const level = getLevel(params.levelId);
    const { text, sprites } = this.#services;
    const sky = level.id === 'luna' ? ['#2a1e4a', '#e0784a', '#ffc27a'] : ['#0a0820', '#2a1450', '#6a2a7a'];
    gfx.fillRect(0, 0, gfx.width, GROUND_Y, { stops: sky, bands: 6, dither: 'bayer4' });
    gfx.fillRect(0, GROUND_Y, gfx.width, gfx.height - GROUND_Y, { stops: ['#4a4038', '#221c18'], bands: 3 });
    gfx.fillRect(0, GROUND_Y, gfx.width, 1, '#8a7a68');

    this.#drawHeader(gfx, level);
    gfx.sprite(sprites.unhappyCustomer, 'walk', this.#time, 250, GROUND_Y, { flipX: true });
    gfx.sprite(
      sprites.characters[params.characterId],
      this.#animation,
      this.#time - this.#animationStart,
      this.#x,
      this.#y,
      {
        flipX: this.#facingLeft,
      },
    );
    if (blink(this.#time, frames(32), frames(16))) {
      gfx.text('CONFIRM: FINISH  ·  BACK: QUIT', gfx.width / 2, 222, text.hud, { align: 'center' });
    }
    drawStubBanner(gfx, this.#services, 'LEVEL');
  }

  #drawHeader(gfx: Gfx, level: LevelInfo): void {
    const { text } = this.#services;
    gfx.text(`${level.mission} · ${level.city}`, gfx.width / 2, 40, text.prompt, { align: 'center' });
    gfx.text(
      `PLAYING AS ${getCharacter(this.#params?.characterId ?? 'hackerman').name}`,
      gfx.width / 2,
      58,
      { ...text.label, fill: palette.cream },
      { align: 'center' },
    );
  }

  #finish(params: LevelParams): void {
    this.#leaving = true;
    this.#services.audio.playSfx('stage-clear');
    this.#services.director.goTo(
      'stageClear',
      {
        levelId: params.levelId,
        characterId: params.characterId,
        result: { score: 12_340, highlights: [], customersWon: 7, timeSeconds: Math.round(this.#time) },
      },
      iris({ x: Math.round(this.#x), y: Math.round(this.#y) - 20 }),
    );
  }
}
