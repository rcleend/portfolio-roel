import { type CharacterId, getCharacter, skills as skillContent } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects, type Rect } from '@/engine/math/Rect';
import type { Rng } from '@/engine/math/Rng';
import type { SfxId } from '../audio/ids';
import type { BubbleText } from '../entities/complaints/SpeechBubble';
import { SpeechBubble } from '../entities/complaints/SpeechBubble';
import { Customer, type CustomerContext } from '../entities/customer/Customer';
import { renderCustomer } from '../entities/customer/renderCustomer';
import { ESCALATED_CUSTOMER } from '../entities/customer/tuning';
import { BURSTS, Burst } from '../entities/effects/Burst';
import type { Effect } from '../entities/effects/Effect';
import { EffectsLayer } from '../entities/effects/Effect';
import { FloatingText } from '../entities/effects/FloatingText';
import { HeartPop } from '../entities/effects/HeartPop';
import { PRIMARY_ATTACKS } from '../entities/player/attacks';
import { NORMAL_SCALE } from '../entities/player/movement';
import { Player, type PlayerIntent } from '../entities/player/Player';
import type { RenderKit } from '../entities/RenderKit';
import type { Shot } from '../entities/shots/Shot';
import type { Barrier } from '../entities/stage/Barrier';
import type { Checkpoint } from '../entities/stage/Checkpoint';
import type { HighlightBlock } from '../entities/stage/HighlightBlock';
import type { MovingPlatform } from '../entities/stage/MovingPlatform';
import type { RateLimitGate } from '../entities/stage/RateLimitGate';
import type { SlowZone } from '../entities/stage/SlowZone';
import type { LevelResult } from '../scenes/params';
import { SKILLS } from '../skills';
import type { ActiveSkill, SkillCaster, SkillTarget, SkillWorld } from '../skills/Skill';
import { SkillSlot } from '../skills/SkillSlot';
import { CameraFollow, type CameraTarget } from './CameraFollow';
import type { CollisionWorld } from './collision';
import type { WorldEvent } from './events';
import { TILE, type TileGrid } from './grid';
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
/** Customers this far outside the view are no longer simulated. */
const ACTIVE_MARGIN = 96;
const STOMP_TOLERANCE = 6;
const BUBBLE_SPEED = { regular: 52, escalated: 66 } as const;
/** Seconds between entering the arena and the escalated customer dropping in. */
const BOSS_DROP_DELAY = 1.1;

/**
 * The level runtime: owns every entity, steps them in a fixed order,
 * resolves who hits whom, and reports what happened as `WorldEvent`s. It
 * knows nothing about audio, overlays or scenes, and implements `SkillWorld`
 * so skills can act on it without seeing the rest.
 */
export class World implements SkillWorld {
  readonly stage: StageDefinition;
  readonly grid: TileGrid;
  readonly camera: CameraFollow;
  readonly player: Player;
  readonly slots: readonly [SkillSlot, SkillSlot];
  readonly blocks: readonly HighlightBlock[];
  readonly movers: readonly MovingPlatform[];
  readonly gates: readonly RateLimitGate[];
  readonly slowZones: readonly SlowZone[];
  readonly barriers: readonly Barrier[];
  readonly checkpoints: readonly Checkpoint[];
  readonly rng: Rng;
  readonly #options: WorldOptions;
  readonly #effects = new EffectsLayer();
  #customers: Customer[];
  #boss: Customer | null = null;
  #bubbles: SpeechBubble[] = [];
  #shots: Shot[] = [];
  #skills: ActiveSkill[] = [];
  #modifiers: ActiveModifiers = NEUTRAL_MODIFIERS;
  #events: WorldEvent[] = [];
  #time = 0;
  #attackCooldown = 0;
  #shotsFired = 0;
  #complaint = 0;
  #score = 0;
  #customersWon = 0;
  #highlights: string[] = [];
  #respawnX: number;
  #arenaEntered = false;
  #bossDropAt: number | null = null;
  #retained = false;
  #down = false;
  #flash: { readonly color: string; readonly until: number } | null = null;

  constructor(options: WorldOptions) {
    this.#options = options;
    this.stage = options.stage;
    this.rng = options.rng;
    this.grid = buildGrid(options.stage.layout);
    const entities = populateStage(options.stage, options.props, options.highlightIds);
    this.blocks = entities.blocks;
    this.movers = entities.movers;
    this.gates = entities.gates;
    this.slowZones = entities.slowZones;
    this.barriers = entities.barriers;
    this.checkpoints = entities.checkpoints;
    this.#customers = entities.customers;

    const { start } = options.stage.layout;
    this.#respawnX = start.col * TILE + TILE / 2;
    this.player = new Player(options.characterId, this.#respawnX, GROUND_Y);
    const [first, second] = getCharacter(options.characterId).skills;
    this.slots = [
      new SkillSlot(SKILLS[first], skillContent[first].cooldownSeconds),
      new SkillSlot(SKILLS[second], skillContent[second].cooldownSeconds),
    ];
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

  hit(target: SkillTarget, damage: number, direction: -1 | 1): void {
    if (target instanceof Customer) this.#hitCustomer(target, damage, direction);
  }

  stun(target: SkillTarget, seconds: number): void {
    if (target instanceof Customer) target.stun(seconds, this.#time);
  }

  popBubbles(area: Rect): number {
    let popped = 0;
    for (const bubble of this.#bubbles) {
      if (!bubble.alive || !intersects(bubble.rect, area)) continue;
      this.#popBubble(bubble);
      popped++;
    }
    return popped;
  }

  fire(shot: Shot): void {
    this.#shots.push(shot);
  }

  effect(effect: Effect): void {
    this.#effects.add(effect);
  }

  shake(intensity: number, seconds: number): void {
    if (!this.#options.reducedMotion) this.camera.shake(intensity, seconds);
  }

  flash(color: string, seconds: number): void {
    if (!this.#options.reducedMotion) this.#flash = { color, until: this.#time + seconds };
  }

  // ── State the scene reads ──────────────────────────────────────────────

  get customers(): readonly Customer[] {
    return this.#customers;
  }

  get boss(): Customer | null {
    return this.#boss;
  }

  get bubbles(): readonly SpeechBubble[] {
    return this.#bubbles;
  }

  get shots(): readonly Shot[] {
    return this.#shots;
  }

  get activeSkills(): readonly ActiveSkill[] {
    return this.#skills;
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

  get arenaX(): number {
    return this.stage.layout.arenaCol * TILE;
  }

  get goalX(): number {
    return this.stage.layout.goal.col * TILE + TILE / 2;
  }

  /** The full-screen flash colour to draw this frame, if any. */
  get flashColor(): string | null {
    return this.#flash && this.#time < this.#flash.until ? this.#flash.color : null;
  }

  /** Returns and clears the events of the steps since the last drain. */
  drainEvents(): WorldEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
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
    this.#stepSkills(dt);
    this.#stepCustomers(dt, collision);
    this.#stepShots(dt);
    this.#stepBubbles(dt);
    if (!this.#down) {
      this.#resolveContacts();
      this.#checkProgress();
    }
    this.#effects.update(dt);
    this.camera.update(this.#cameraTarget(), dt);
  }

  /** Puts the player back at the last checkpoint after the scene's fade; `heal` refills the hearts. */
  respawn(heal: boolean): void {
    this.#down = false;
    if (heal) this.player.heal();
    this.player.respawn(this.#respawnX, GROUND_Y, this.#time);
    this.#bubbles = [];
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

  render(gfx: Gfx, kit: RenderKit): void {
    const { props } = kit.art;
    const moverProp = props[this.stage.theme.mover.prop];
    for (const mover of this.movers) if (moverProp) mover.render(gfx, moverProp);
    const barrierProp = this.stage.theme.barrier ? props[this.stage.theme.barrier.prop] : undefined;
    for (const barrier of this.barriers) if (barrierProp) barrier.render(gfx, barrierProp);
    const gateProp = this.stage.theme.gate ? props[this.stage.theme.gate.prop] : undefined;
    for (const gate of this.gates) if (gateProp) gate.render(gfx, gateProp, kit.time);
    for (const checkpoint of this.checkpoints) checkpoint.render(gfx, kit.time);
    for (const block of this.blocks) block.render(gfx, kit.art.tileset, kit.time);

    const caster = this.caster;
    for (const skill of this.#skills) skill.render(gfx, kit, caster, 'behind');
    for (const customer of this.#customers) if (customer.won) renderCustomer(gfx, kit, customer, this.#modifiers);
    for (const customer of this.#customers) if (!customer.won) renderCustomer(gfx, kit, customer, this.#modifiers);
    if (!this.#down) this.player.render(gfx, kit);
    for (const shot of this.#shots) shot.render(gfx, kit);
    for (const bubble of this.#bubbles) bubble.render(gfx, kit);
    for (const skill of this.#skills) skill.render(gfx, kit, caster, 'front');
    this.#effects.render(gfx, kit);
    const zoneProp = this.stage.theme.slowZone ? props[this.stage.theme.slowZone.prop] : undefined;
    for (const zone of this.slowZones) if (zoneProp) zone.render(gfx, zoneProp, kit.time);
  }

  // ── Steps ──────────────────────────────────────────────────────────────

  #stepPlayer(intent: PlayerIntent, dt: number, collision: CollisionWorld): void {
    const { player } = this;
    const zone = this.slowZones.find((candidate) => candidate.contains(player.rect));
    const fallSpeed = player.body.vy;
    const step = player.update(intent, dt, collision, this.#time, zone?.scale ?? NORMAL_SCALE);
    if (step.jumped) this.#sfx('jump');
    if (step.landed && fallSpeed > 200) {
      this.#sfx('land');
      this.effect(new Burst(player.centerX, player.feet, BURSTS.dust, this.rng));
    }
    for (const cell of step.ceilingCells) {
      const block = this.blocks.find((candidate) => candidate.col === cell.col && candidate.row === cell.row);
      if (block) this.#collect(block);
    }

    this.#attackCooldown = Math.max(0, this.#attackCooldown - dt);
    const locked = player.isLocked(this.#time);
    if (intent.attackHeld && this.#attackCooldown === 0 && !locked && !this.#retained) this.#attack();
    this.slots.forEach((slot, index) => {
      slot.update(dt);
      const pressed = index === 0 ? intent.skill1Pressed : intent.skill2Pressed;
      if (!pressed || locked || this.#retained) return;
      const running = slot.tryCast(this);
      if (!running) return;
      this.#skills.push(running);
      player.strike('skill', this.#time, 0.4);
      this.#sfx(slot.skill.sfx);
      this.#events.push({ kind: 'skillCast', skillId: slot.skill.id });
    });
  }

  #attack(): void {
    const { player } = this;
    const attack = PRIMARY_ATTACKS[player.characterId];
    const hand = player.hand;
    this.#shots.push(attack.fire(hand.x, hand.y, player.facing, this.#shotsFired++));
    this.#attackCooldown = attack.cooldown;
    player.strike('attack', this.#time, attack.cooldown);
    this.#sfx(attack.sfx);
  }

  #stepSkills(dt: number): void {
    for (const skill of this.#skills) skill.update(this, dt);
    this.#skills = this.#skills.filter((skill) => !skill.done);
  }

  #stepCustomers(dt: number, collision: CollisionWorld): void {
    this.#maybeDropBoss();
    const view = this.view;
    const context: CustomerContext = {
      time: this.#time,
      player: { x: this.player.centerX, feet: this.player.feet },
      collision,
      speedScale: this.#modifiers.customerSpeed,
      calm: this.#modifiers.customersCalm || this.#down,
      rng: this.rng,
      shout: (customer, index) => this.#shout(customer, index),
      landed: () => this.#bossLanded(),
    };
    for (const customer of this.#customers) {
      // Off-screen customers wait; nobody should shout from beyond the edge of the screen.
      const near = customer.centerX > view.x - ACTIVE_MARGIN && customer.centerX < view.x + view.w + ACTIVE_MARGIN;
      if (near || customer === this.#boss) customer.update(dt, context);
    }
    this.#customers = this.#customers.filter(
      (customer) =>
        customer.feet < FALL_LIMIT + 200 &&
        !(customer.won && (customer.centerX < view.x - 48 || customer.centerX > view.x + view.w + 48)),
    );
  }

  #stepShots(dt: number): void {
    const targets = this.#customers.filter((customer) => customer.active && intersects(customer.rect, this.view));
    for (const shot of this.#shots) {
      shot.update(dt, { grid: this.grid, targets });
      if (shot.struckCell) {
        const { col, row } = shot.struckCell;
        const block = this.blocks.find((candidate) => candidate.col === col && candidate.row === row);
        if (block) this.#collect(block);
        this.#impact(shot);
        continue;
      }
      for (const customer of this.#customers) {
        if (!shot.alive || !customer.active || !intersects(shot.rect, customer.rect)) continue;
        this.#hitCustomer(customer, shot.damage, shot.direction);
        this.#impact(shot);
        shot.strike();
      }
      for (const bubble of this.#bubbles) {
        if (!shot.alive || !bubble.alive || !intersects(shot.rect, bubble.rect)) continue;
        this.#popBubble(bubble);
        shot.strike();
      }
    }
    this.#shots = this.#shots.filter((shot) => shot.alive && Math.abs(shot.x - this.player.centerX) < 400);
  }

  #stepBubbles(dt: number): void {
    for (const bubble of this.#bubbles) {
      bubble.update(dt);
      if (this.#down || !bubble.alive || !intersects(bubble.rect, this.player.rect)) continue;
      this.#popBubble(bubble);
      this.#damagePlayer(bubble.center.x);
    }
    this.#bubbles = this.#bubbles.filter((bubble) => bubble.alive);
  }

  #resolveContacts(): void {
    const { player } = this;
    for (const customer of this.#customers) {
      if (!customer.active || !intersects(player.rect, customer.rect)) continue;
      const previousFeet = player.feet - player.body.vy / 60;
      const stomp = player.body.vy > 0 && previousFeet <= customer.rect.y + STOMP_TOLERANCE && !customer.charging;
      if (stomp) {
        player.bounce();
        this.#hitCustomer(customer, 1, player.facing);
      } else if (!this.#modifiers.playerShielded) {
        this.#damagePlayer(customer.centerX);
      }
    }
  }

  #checkProgress(): void {
    const { player } = this;
    this.checkpoints.forEach((checkpoint, index) => {
      if (!checkpoint.check(player.centerX, this.#time)) return;
      this.#respawnX = checkpoint.x;
      this.#sfx('checkpoint');
      this.#events.push({ kind: 'checkpoint', index });
      this.effect(new FloatingText('CHECKPOINT!', checkpoint.x, GROUND_Y - 64, 'pop', { rise: 10, life: 1.4 }));
    });
    if (!this.#arenaEntered && player.centerX > this.arenaX + 2 * TILE) {
      this.#arenaEntered = true;
      this.#respawnX = this.arenaX + 2 * TILE;
      this.camera.lockLeft(this.arenaX);
      this.#bossDropAt = this.#time + BOSS_DROP_DELAY;
      this.#events.push({ kind: 'arenaEntered' });
    }
    if (player.feet > FALL_LIMIT) this.#playerDown('pit');
  }

  // ── Interactions ───────────────────────────────────────────────────────

  #hitCustomer(customer: Customer, damage: number, direction: -1 | 1): void {
    const outcome = customer.hit({ damage, direction, decisive: this.#modifiers.decisiveHits }, this.#time);
    if (outcome === 'ignored') return;
    const top = customer.rect.y;
    this.effect(new Burst(customer.centerX, top + customer.rect.h / 2, BURSTS.hitSpark, this.rng));
    if (outcome === 'hurt') {
      this.#sfx('hit');
      return;
    }
    const mrr = customer.tuning.mrr;
    this.#score += mrr;
    this.#customersWon++;
    this.#sfx('customer-happy');
    this.effect(new HeartPop(customer.centerX, top));
    this.effect(new FloatingText(formatMrrGain(mrr), customer.centerX, top - 22, 'mrrPop'));
    this.#events.push({ kind: 'customerWon', mrr, escalated: customer.escalated });
    if (customer === this.#boss) this.#retain();
  }

  #retain(): void {
    this.#retained = true;
    for (const bubble of this.#bubbles) this.#popBubble(bubble);
    for (const customer of this.#customers) if (customer.active) customer.hit({ damage: 99, direction: 1 }, this.#time);
    this.#events.push({ kind: 'bossRetained' });
  }

  #damagePlayer(fromX: number): void {
    if (this.#modifiers.playerShielded || this.#retained) return;
    if (!this.player.hurt(fromX, this.#time)) return;
    this.#sfx('hurt');
    this.shake(2, 0.2);
    if (this.player.hearts === 0) this.#playerDown('hearts');
  }

  #playerDown(reason: 'pit' | 'hearts'): void {
    if (this.#down) return;
    this.#down = true;
    if (reason === 'pit') {
      this.player.hearts = Math.max(0, this.player.hearts - 1);
      this.#sfx('hurt');
    }
    this.#events.push({ kind: 'playerDown', reason: this.player.hearts === 0 ? 'hearts' : reason });
  }

  #collect(block: HighlightBlock): void {
    if (!block.collect(this.#time)) return;
    this.#highlights.push(block.highlightId);
    const { x, y, w } = block.rect;
    this.effect(new Burst(x + w / 2, y, BURSTS.blockSparkle, this.rng));
    this.#events.push({ kind: 'highlight', highlightId: block.highlightId });
  }

  #shout(customer: Customer, index: number): void {
    const complaints = this.#options.complaints;
    const text = complaints[this.#complaint++ % Math.max(1, complaints.length)] ?? '!';
    const mouth = customer.mouth;
    const scale = customer.tuning.scale;
    // The escalated customer's volley alternates a low bubble (jump it) and a high one (walk under it).
    const centerY = customer.escalated ? customer.feet - (index % 2 === 0 ? 16 : 66) : customer.feet - 19;
    const fromX = mouth.x - customer.facing * index * 28 * scale;
    const speed = customer.escalated ? BUBBLE_SPEED.escalated : BUBBLE_SPEED.regular;
    this.#bubbles.push(new SpeechBubble(this.#options.layoutBubble(text), fromX, centerY, customer.facing, speed));
    if (index === 0) this.#sfx('complaint');
  }

  #popBubble(bubble: SpeechBubble): void {
    if (!bubble.alive) return;
    bubble.pop();
    const { x, y } = bubble.center;
    this.effect(new Burst(x, y, BURSTS.bubblePop, this.rng));
    this.effect(new FloatingText('POP!', x, y - 6, 'pop', { rise: 8, life: 0.5 }));
    this.#sfx('hit');
  }

  #impact(shot: Shot): void {
    this.effect(new Burst(shot.x, shot.y, shot.spec.impact === 'star' ? BURSTS.starImpact : BURSTS.hitSpark, this.rng));
  }

  #maybeDropBoss(): void {
    if (this.#bossDropAt === null || this.#time < this.#bossDropAt) return;
    this.#bossDropAt = null;
    const { boss } = this.stage.layout;
    this.#boss = new Customer(ESCALATED_CUSTOMER, boss.col * TILE + TILE / 2, -40, { kind: 'entering' });
    this.#customers.push(this.#boss);
  }

  #bossLanded(): void {
    this.shake(5, 0.45);
    const boss = this.#boss;
    if (boss) this.effect(new Burst(boss.centerX, boss.feet, BURSTS.bigDust, this.rng));
    this.#sfx('explosion');
    this.#events.push({ kind: 'bossLanded' });
  }

  #collision(): CollisionWorld {
    const walls: Rect[] = [];
    for (const gate of this.gates) if (gate.wall) walls.push(gate.wall);
    if (this.#arenaEntered) walls.push({ x: this.arenaX - TILE, y: -240, w: TILE, h: 480 });
    return { grid: this.grid, surfaces: [...this.movers, ...this.barriers], walls };
  }

  #cameraTarget(): CameraTarget {
    const { player } = this;
    return { x: player.centerX, facing: player.facing, vx: player.body.vx };
  }

  #sfx(id: SfxId): void {
    this.#events.push({ kind: 'sfx', id });
  }
}
