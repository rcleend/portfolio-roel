import type { CharacterId } from '@/content';
import { intersects, type Rect } from '@/engine/math/Rect';
import type { Rng } from '@/engine/math/Rng';
import type { BubbleText, SpeechBubble } from '../entities/complaints/SpeechBubble';
import { Customer, type CustomerContext } from '../entities/customer/Customer';
import { BURSTS, Burst } from '../entities/effects/Burst';
import type { Effect } from '../entities/effects/Effect';
import { FloatingText } from '../entities/effects/FloatingText';
import { HeartPop } from '../entities/effects/HeartPop';
import { NORMAL_SCALE } from '../entities/player/movement';
import { Player, type PlayerIntent } from '../entities/player/Player';
import type { Shot } from '../entities/shots/Shot';
import type { Barrier } from '../entities/stage/Barrier';
import type { Checkpoint } from '../entities/stage/Checkpoint';
import { GoalFlag } from '../entities/stage/GoalFlag';
import type { HighlightBlock } from '../entities/stage/HighlightBlock';
import type { MovingPlatform } from '../entities/stage/MovingPlatform';
import type { RateLimitGate } from '../entities/stage/RateLimitGate';
import type { SlowZone } from '../entities/stage/SlowZone';
import type { LevelResult } from '../scenes/params';
import type { ActiveSkill, SkillCaster, SkillTarget, SkillWorld } from '../skills/Skill';
import type { SkillSlot } from '../skills/SkillSlot';
import { Arena } from './Arena';
import { CameraFollow, type CameraTarget } from './CameraFollow';
import { Complaints } from './Complaints';
import type { CollisionWorld } from './collision';
import type { WorldEvent } from './events';
import { Feedback } from './Feedback';
import { TILE, type TileGrid } from './grid';
import { Loadout } from './Loadout';
import { buildGrid, GROUND_Y } from './map/buildGrid';
import { type ActiveModifiers, combineModifiers, NEUTRAL_MODIFIERS } from './modifiers';
import { populateStage, type StageProps } from './populate';
import { formatMrrGain } from './scoring';
import type { StageDefinition } from './stage';

export interface WorldOptions {
  readonly stage: StageDefinition;
  readonly props: StageProps;
  readonly characterId: CharacterId;
  /** Highlight ids for the stage's "?" blocks, in block order. */
  readonly highlightIds: readonly string[];
  /** The level's complaint lines, shouted in rotation. */
  readonly complaints: readonly string[];
  /** Wraps a complaint to bubble width with the bubble font. */
  readonly layoutBubble: (text: string) => BubbleText;
  readonly rng: Rng;
  readonly reducedMotion: boolean;
  readonly screen: { readonly width: number; readonly height: number };
}

/** Feet below this line mean the player fell out of the world. */
const FALL_LIMIT = GROUND_Y + 64;
/** Customers this far outside the view wait instead of being simulated. */
const ACTIVE_MARGIN = 96;
/** Won-over customers are let go once they stroll this far off screen. */
const DISMISS_MARGIN = 48;
const STOMP_TOLERANCE = 6;
/** Roughly how far a knockback carries the player, px. */
const PUSHBACK_REACH = 40;
/** Shots this far from the player are no longer worth simulating. */
const SHOT_RANGE = 400;

/**
 * The level runtime: owns every entity, steps them in a fixed order,
 * resolves who hits whom, and reports what happened through `Feedback`
 * (events and effects). It knows nothing about audio, overlays or scenes,
 * and implements `SkillWorld` so skills can act on it without seeing the rest.
 */
export class World implements SkillWorld {
  readonly stage: StageDefinition;
  readonly grid: TileGrid;
  readonly camera: CameraFollow;
  readonly player: Player;
  readonly loadout: Loadout;
  readonly arena: Arena;
  readonly feedback = new Feedback();
  readonly blocks: readonly HighlightBlock[];
  readonly movers: readonly MovingPlatform[];
  readonly gates: readonly RateLimitGate[];
  readonly slowZones: readonly SlowZone[];
  readonly barriers: readonly Barrier[];
  readonly checkpoints: readonly Checkpoint[];
  /** Berlin's PRODUCT-MARKET FIT flagpole; `null` where the finale needs no prop. */
  readonly goalFlag: GoalFlag | null;
  readonly rng: Rng;
  /** The escalated customer is too big for girders: it walks (and lands) on the ground only. */
  readonly #groundOnly: TileGrid;
  readonly #complaints: Complaints;
  readonly #reducedMotion: boolean;
  #customers: Customer[];
  #shots: Shot[] = [];
  #skills: ActiveSkill[] = [];
  #modifiers: ActiveModifiers = NEUTRAL_MODIFIERS;
  #time = 0;
  #score = 0;
  #customersWon = 0;
  #highlights: string[] = [];
  #respawnX: number;
  #retained = false;
  #down = false;

  constructor(options: WorldOptions) {
    const { stage } = options;
    this.stage = stage;
    this.rng = options.rng;
    this.#reducedMotion = options.reducedMotion;
    this.grid = buildGrid(stage.layout);
    this.#groundOnly = buildGrid(stage.layout, { platforms: false });
    const entities = populateStage(stage, options.props, options.highlightIds);
    this.blocks = entities.blocks;
    this.movers = entities.movers;
    this.gates = entities.gates;
    this.slowZones = entities.slowZones;
    this.barriers = entities.barriers;
    this.checkpoints = entities.checkpoints;
    this.#customers = entities.customers;
    this.#complaints = new Complaints(options.complaints, options.layoutBubble, this.feedback, this.rng);
    this.arena = new Arena(stage.layout.arenaCol, stage.layout.boss.col, options.screen.width);
    this.goalFlag =
      stage.theme.finale === 'product-market-fit'
        ? new GoalFlag(this.goalX + TILE, GROUND_Y, 'PRODUCT-MARKET FIT')
        : null;

    this.#respawnX = stage.layout.start.col * TILE + TILE / 2;
    this.player = new Player(options.characterId, this.#respawnX, GROUND_Y);
    this.loadout = new Loadout(options.characterId);
    this.camera = new CameraFollow(options.screen.width, options.screen.height, this.grid.widthPx);
    this.camera.snapTo(this.#cameraTarget());
  }

  // ── SkillWorld ──────────────────────────────────────────────────────────

  get time(): number {
    return this.#time;
  }

  get caster(): SkillCaster {
    const { player } = this;
    return { x: player.centerX, y: player.centerY, feet: player.feet, facing: player.facing };
  }

  get view(): Rect {
    return { x: this.camera.view.x, y: 0, w: this.camera.width, h: this.camera.height };
  }

  targets(): readonly SkillTarget[] {
    return this.#customers.filter((customer) => customer.active);
  }

  hit(target: SkillTarget, damage: number, direction: -1 | 1, spark?: (burst: Burst) => Effect): void {
    if (target instanceof Customer) this.#hitCustomer(target, damage, direction, spark);
  }

  stun(target: SkillTarget, seconds: number): void {
    if (target instanceof Customer) target.stun(seconds, this.#time);
  }

  popBubbles(area: Rect): number {
    return this.#complaints.popWithin(area);
  }

  fire(shot: Shot): void {
    this.#shots.push(shot);
  }

  effect(effect: Effect): void {
    this.feedback.effect(effect);
  }

  shake(intensity: number, seconds: number): void {
    if (!this.#reducedMotion) this.camera.shake(intensity, seconds);
  }

  flash(color: string, seconds: number): void {
    if (!this.#reducedMotion) this.feedback.flash(color, this.#time + seconds);
  }

  // ── State the scene reads ──────────────────────────────────────────────

  get customers(): readonly Customer[] {
    return this.#customers;
  }

  get boss(): Customer | null {
    return this.arena.boss;
  }

  get bubbles(): readonly SpeechBubble[] {
    return this.#complaints.bubbles;
  }

  get shots(): readonly Shot[] {
    return this.#shots;
  }

  get activeSkills(): readonly ActiveSkill[] {
    return this.#skills;
  }

  get slots(): readonly [SkillSlot, SkillSlot] {
    return this.loadout.slots;
  }

  get modifiers(): ActiveModifiers {
    return this.#modifiers;
  }

  get score(): number {
    return this.#score;
  }

  get highlights(): readonly string[] {
    return this.#highlights;
  }

  /** False between falling into a pit (or losing the last heart) and the respawn. */
  get playerVisible(): boolean {
    return !this.#down;
  }

  get arenaX(): number {
    return this.arena.x;
  }

  get goalX(): number {
    return this.stage.layout.goal.col * TILE + TILE / 2;
  }

  /** The full-screen flash colour to draw this frame, if any. */
  get flashColor(): string | null {
    return this.feedback.flashColor(this.#time);
  }

  /** Returns and clears the events of the steps since the last drain. */
  drainEvents(): WorldEvent[] {
    return this.feedback.drain();
  }

  result(): LevelResult {
    return {
      score: this.#score,
      highlights: [...this.#highlights],
      customersWon: this.#customersWon,
      timeSeconds: Math.round(this.#time),
    };
  }

  // ── Simulation ─────────────────────────────────────────────────────────

  step(intent: PlayerIntent, dt: number): void {
    this.#time += dt;
    this.#modifiers = combineModifiers(this.#skills);
    for (const mover of this.movers) mover.update(dt, this.player.standingOn === mover);
    for (const gate of this.gates) gate.update(dt, [this.player.rect, ...this.#customers.map((c) => c.rect)]);
    const collision = this.#collision();

    if (!this.#down) this.#stepPlayer(intent, dt, collision);
    for (const skill of this.#skills) skill.update(this, dt);
    this.#skills = this.#skills.filter((skill) => !skill.done);
    this.#stepCustomers(dt, collision);
    this.#stepShots(dt);
    this.#stepBubbles(dt);
    if (!this.#down) {
      this.#resolveContacts();
      this.#checkProgress();
    }
    this.feedback.effects.update(dt);
    this.camera.update(this.#cameraTarget(), dt);
  }

  /** Puts the player back at the last checkpoint after the scene's fade; `heal` refills the hearts. */
  respawn(heal: boolean): void {
    this.#down = false;
    if (heal) this.player.heal();
    this.player.respawn(this.#respawnX, GROUND_Y, this.#time);
    this.#complaints.clear();
    this.camera.snapTo(this.#cameraTarget());
  }

  /** Development shortcut: starts at checkpoint `index` (0-based), or in front of the arena with `'arena'`. */
  skipTo(target: number | 'arena'): void {
    const x = target === 'arena' ? this.arenaX - 3 * TILE : this.checkpoints[target]?.x;
    if (x === undefined) return;
    for (const checkpoint of this.checkpoints) if (checkpoint.x <= x) checkpoint.check(x, this.#time);
    this.#customers = this.#customers.filter((customer) => customer.centerX > x + 64);
    this.#respawnX = x;
    this.player.respawn(x, GROUND_Y, this.#time);
    this.camera.snapTo(this.#cameraTarget());
  }

  // ── Steps ──────────────────────────────────────────────────────────────

  #stepPlayer(intent: PlayerIntent, dt: number, collision: CollisionWorld): void {
    const { player, feedback } = this;
    const zone = this.slowZones.find((candidate) => candidate.contains(player.rect));
    const fallSpeed = player.body.vy;
    const step = player.update(intent, dt, collision, this.#time, zone?.scale ?? NORMAL_SCALE);
    if (step.jumped) feedback.sfx('jump');
    if (step.landed && fallSpeed > 200) {
      feedback.sfx('land');
      feedback.effect(new Burst(player.centerX, player.feet, BURSTS.dust, this.rng));
    }
    for (const cell of step.ceilingCells) this.#collectAt(cell.col, cell.row);

    const canAct = !player.isLocked(this.#time) && !this.#retained;
    const hand = { ...player.hand, facing: player.facing };
    const triggered = this.loadout.step(intent, dt, canAct, hand, this);
    if (triggered.shot) {
      this.#shots.push(triggered.shot);
      player.strike('attack', this.#time, this.loadout.attack.cooldown);
      feedback.sfx(this.loadout.attack.sfx);
    }
    for (const { slot, running } of triggered.casts) {
      this.#skills.push(running);
      player.strike('skill', this.#time, 0.4);
      feedback.sfx(slot.skill.sfx);
      feedback.emit({ kind: 'skillCast', skillId: slot.skill.id });
    }
  }

  #stepCustomers(dt: number, collision: CollisionWorld): void {
    const boss = this.arena.dropBoss(this.#time, this.player.centerX);
    if (boss) this.#customers.push(boss);
    const view = this.view;
    const context: CustomerContext = {
      time: this.#time,
      player: { x: this.player.centerX, feet: this.player.feet },
      collision,
      speedScale: this.#modifiers.customerSpeed,
      calm: this.#modifiers.customersCalm || this.#down,
      view,
      rng: this.rng,
      shout: (customer, index) => this.#complaints.shout(customer, index),
      landed: (customer) => this.#bossLanded(customer),
    };
    const bossContext: CustomerContext = { ...context, collision: { ...collision, grid: this.#groundOnly } };
    const near = (x: number, margin: number) => x > view.x - margin && x < view.x + view.w + margin;
    for (const customer of this.#customers) {
      // Off-screen customers wait; nobody should shout from beyond the edge of the screen.
      if (customer === this.arena.boss) customer.update(dt, bossContext);
      else if (near(customer.centerX, ACTIVE_MARGIN)) customer.update(dt, context);
    }
    this.#customers = this.#customers.filter(
      (customer) => customer.feet < FALL_LIMIT + 200 && !(customer.won && !near(customer.centerX, DISMISS_MARGIN)),
    );
  }

  #stepShots(dt: number): void {
    const targets = this.#customers.filter((customer) => customer.active && intersects(customer.rect, this.view));
    for (const shot of this.#shots) {
      shot.update(dt, { grid: this.grid, targets });
      if (shot.struckCell) {
        this.#collectAt(shot.struckCell.col, shot.struckCell.row);
        this.#impact(shot);
        continue;
      }
      for (const customer of this.#customers) {
        if (!shot.alive || !customer.active || !intersects(shot.rect, customer.rect)) continue;
        this.#hitCustomer(customer, shot.damage, shot.direction, (burst) => shot.hitEffect(burst));
        this.#impact(shot);
        shot.strike();
      }
      if (!shot.alive) continue;
      const [bubble] = this.#complaints.touching(shot.rect);
      if (bubble) {
        this.#complaints.pop(bubble);
        shot.strike();
      }
    }
    this.#shots = this.#shots.filter((shot) => shot.alive && Math.abs(shot.x - this.player.centerX) < SHOT_RANGE);
  }

  #stepBubbles(dt: number): void {
    this.#complaints.update(dt);
    if (this.#down) return;
    for (const bubble of this.#complaints.touching(this.player.rect)) {
      this.#complaints.pop(bubble);
      this.#damagePlayer(bubble.center.x);
    }
  }

  #resolveContacts(): void {
    const { player } = this;
    for (const customer of this.#customers) {
      if (!customer.active || !intersects(player.rect, customer.rect)) continue;
      const previousFeet = player.feet - player.body.vy / 60;
      // Landing on a head always counts — even a charging escalated customer can be vaulted that way.
      const stomp = player.body.vy > 0 && previousFeet <= customer.rect.y + STOMP_TOLERANCE;
      if (stomp) {
        player.bounce();
        this.#hitCustomer(customer, 1, player.facing);
      } else if (!this.#modifiers.playerShielded) {
        this.#damagePlayer(customer.centerX);
      }
    }
  }

  #checkProgress(): void {
    const { player, feedback } = this;
    this.checkpoints.forEach((checkpoint, index) => {
      if (!checkpoint.check(player.centerX, this.#time)) return;
      this.#respawnX = checkpoint.x;
      feedback.sfx('checkpoint');
      feedback.emit({ kind: 'checkpoint', index });
      feedback.effect(new FloatingText('CHECKPOINT!', checkpoint.x, GROUND_Y - 64, 'pop', { rise: 10, life: 1.4 }));
    });
    if (this.arena.enter(player.centerX, this.#time)) {
      this.#respawnX = this.arena.respawnX;
      this.camera.lockLeft(this.arena.x);
      feedback.emit({ kind: 'arenaEntered' });
    }
    if (player.feet > FALL_LIMIT) this.#playerDown('pit');
  }

  // ── Interactions ───────────────────────────────────────────────────────

  /** `spark` hands the hit's spark to the look of whoever landed it (a shot, a skill); stomps keep the shared one. */
  #hitCustomer(
    customer: Customer,
    damage: number,
    direction: -1 | 1,
    spark: (burst: Burst) => Effect = (burst) => burst,
  ): void {
    const { feedback } = this;
    const outcome = customer.hit({ damage, direction, decisive: this.#modifiers.decisiveHits }, this.#time);
    if (outcome === 'ignored') return;
    const top = customer.rect.y;
    feedback.effect(spark(new Burst(customer.centerX, top + customer.rect.h / 2, BURSTS.hitSpark, this.rng)));
    if (outcome === 'hurt') {
      feedback.sfx('hit');
      return;
    }
    const mrr = customer.tuning.mrr;
    this.#score += mrr;
    this.#customersWon++;
    feedback.sfx('customer-happy');
    const { scale } = customer.tuning;
    feedback.effect(new HeartPop(customer.centerX, top, scale));
    feedback.effect(
      new FloatingText(formatMrrGain(mrr), customer.centerX, top - 22, 'mrrPop', { aboveCustomer: scale }),
    );
    feedback.emit({ kind: 'customerWon', mrr, escalated: customer.escalated });
    if (customer === this.arena.boss) this.#retain();
  }

  /** The escalated customer is won over: everyone else calms down and the level is as good as cleared. */
  #retain(): void {
    this.#retained = true;
    this.#complaints.popAll();
    for (const customer of this.#customers) if (customer.active) customer.hit({ damage: 99, direction: 1 }, this.#time);
    this.feedback.emit({ kind: 'bossRetained' });
  }

  #damagePlayer(fromX: number): void {
    if (this.#modifiers.playerShielded || this.#retained) return;
    if (!this.player.hurt(fromX, this.#time, this.#safeToPush(fromX))) return;
    this.feedback.sfx('hurt');
    this.shake(2, 0.2);
    if (this.player.hearts === 0) this.#playerDown('hearts');
  }

  /** A hit never shoves the player off a vehicle or into a pit: that would cost two hearts for one mistake. */
  #safeToPush(fromX: number): boolean {
    const { player, grid } = this;
    if (player.standingOn) return false;
    const landing = player.centerX + (player.centerX < fromX ? -1 : 1) * PUSHBACK_REACH;
    return grid.kindAt(grid.colAt(landing), grid.rowAt(player.feet + 1)) !== 'empty';
  }

  #playerDown(reason: 'pit' | 'hearts'): void {
    if (this.#down) return;
    this.#down = true;
    if (reason === 'pit') {
      this.player.hearts = Math.max(0, this.player.hearts - 1);
      this.feedback.sfx('hurt');
    }
    this.feedback.emit({ kind: 'playerDown', reason: this.player.hearts === 0 ? 'hearts' : reason });
  }

  #collectAt(col: number, row: number): void {
    const block = this.blocks.find((candidate) => candidate.col === col && candidate.row === row);
    if (!block?.collect(this.#time)) return;
    this.#highlights.push(block.highlightId);
    const { x, y, w } = block.rect;
    this.feedback.effect(new Burst(x + w / 2, y, BURSTS.blockSparkle, this.rng));
    this.feedback.emit({ kind: 'highlight', highlightId: block.highlightId });
  }

  #impact(shot: Shot): void {
    const recipe = shot.spec.impact === 'star' ? BURSTS.starImpact : BURSTS.hitSpark;
    this.feedback.effect(shot.impactEffect(new Burst(shot.x, shot.y, recipe, this.rng)));
  }

  #bossLanded(boss: Customer): void {
    this.shake(5, 0.45);
    this.feedback.effect(new Burst(boss.centerX, boss.feet, BURSTS.bigDust, this.rng));
    this.feedback.sfx('explosion');
    this.feedback.emit({ kind: 'bossLanded' });
  }

  #collision(): CollisionWorld {
    const walls: Rect[] = [];
    for (const gate of this.gates) if (gate.wall) walls.push(gate.wall);
    const arenaWall = this.arena.wall;
    if (arenaWall) walls.push(arenaWall);
    return { grid: this.grid, surfaces: [...this.movers, ...this.barriers], walls };
  }

  #cameraTarget(): CameraTarget {
    const { player } = this;
    return { x: player.centerX, facing: player.facing, vx: player.body.vx };
  }
}
