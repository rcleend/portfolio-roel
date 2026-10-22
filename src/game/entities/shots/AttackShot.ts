import type { CharacterId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { AttackImpact } from '../effects/AttackImpact';
import type { Burst } from '../effects/Burst';
import type { Effect } from '../effects/Effect';
import type { PrimaryAttack } from '../player/attacks';
import type { RenderKit } from '../RenderKit';
import type { AttackShotView } from './AttackVisual';
import { drawLaunched } from './launch';
import { Shot, type ShotEnvironment } from './Shot';

/** A hero's basic-attack shot: flies as `PRIMARY_ATTACKS` says, and looks as the hero's look draws it. */
export class AttackShot extends Shot implements AttackShotView {
  readonly owner: CharacterId;
  readonly index: number;
  readonly #gravity: number;

  /** `index` counts the shots the hero fired before this one. */
  constructor(owner: CharacterId, index: number, attack: PrimaryAttack, x: number, y: number, facing: -1 | 1) {
    super(attack.shot, x, y, facing * attack.launch.x, attack.launch.y);
    this.owner = owner;
    this.index = index;
    this.#gravity = attack.gravity;
  }

  protected override steer(dt: number, _env: ShotEnvironment): void {
    this.vy += this.#gravity * dt;
  }

  render(gfx: Gfx, kit: RenderKit): void {
    const hero = kit.looks.characters[this.owner];
    drawLaunched(gfx, hero.sheet, this.direction, () => hero.attack.shot(gfx, this, kit));
  }

  impactEffect(burst: Burst): Effect {
    return new AttackImpact(this.owner, this.direction, burst);
  }
}
