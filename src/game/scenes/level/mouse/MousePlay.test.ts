import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../../../world/map/buildGrid';
import { navKit } from '../../../world/nav/kit';
import { createTestWorld } from '../../../world/testing';
import type { World } from '../../../world/World';
import { DOUBLE_CLICK_SECONDS, MousePlay } from './MousePlay';
import { TestMouse } from './testing';

const DT = 1 / 60;
/** A row of the screen on the ground's top band: a double click there walks. */
const FLOOR_Y = GROUND_Y + 8;
/** A row in the sky: a click there is an attack, never a walk. */
const SKY_Y = 60;

function setup(levelId: 'luna' | 'scripe' = 'luna') {
  const world = createTestWorld(levelId, 'hackerman', 7);
  const play = new MousePlay(navKit);
  const mouse = new TestMouse();
  let time = 0;
  /** Steps the world with what the mouse has the hero do, `frames` times. */
  const step = (frames = 1): void => {
    for (let frame = 0; frame < frames; frame++) {
      const intent = play.update(mouse.snapshot(), world, time, DT, true);
      world.step(intent, DT);
      world.drainEvents();
      time += DT;
    }
  };
  step(20);
  /** Native screen x of a world x, with the camera where it is now. */
  const screenX = (x: number): number => x - world.camera.view.x;
  const click = (x: number, y: number): void => {
    mouse.move(x, y).press();
    step(4);
    mouse.release();
    step(1);
  };
  /** Two clicks a few frames apart, as a hand double-clicks. */
  const doubleClick = (x: number, y: number): void => {
    click(x, y);
    step(4);
    click(x, y);
  };
  /** Steps until a walk under way ends (at most `frames`). */
  const arrive = (frames = 240): void => {
    for (let frame = 0; frame < frames && play.walking; frame++) step(1);
  };
  return { world, play, mouse, step, screenX, click, doubleClick, arrive };
}

const shots = (world: World) => world.shots;

describe('MousePlay', () => {
  it('turns the hero towards a click and attacks that way, once', () => {
    const { world, step, screenX, click } = setup();
    const hero = screenX(world.player.centerX);
    click(hero - 80, SKY_Y);
    expect(world.player.facing).toBe(-1);
    expect(world.loadout.fired).toBe(1);
    expect(shots(world)[0]?.vx).toBeLessThan(0);
    step(30);
    click(hero + 80, SKY_Y);
    expect(world.player.facing).toBe(1);
    expect(world.loadout.fired).toBe(2);
    expect(shots(world).at(-1)?.vx).toBeGreaterThan(0);
  });

  it('keeps firing while the button is held in the play', () => {
    const { world, mouse, step, screenX } = setup();
    mouse.move(screenX(world.player.centerX) + 60, SKY_Y).press();
    step(60);
    mouse.release();
    step(1);
    // Hackerman's attack fires every 0.22 s: about five in a second held.
    expect(world.loadout.fired).toBeGreaterThanOrEqual(4);
  });

  it('walks to a double-clicked spot on the floor without attacking', () => {
    const { world, play, screenX, doubleClick, arrive } = setup();
    const target = world.player.centerX + 90;
    doubleClick(screenX(target), FLOOR_Y);
    expect(play.walking).toBe(true);
    arrive();
    expect(play.walking).toBe(false);
    expect(Math.abs(world.player.centerX - target)).toBeLessThan(3);
    expect(world.loadout.fired).toBe(0);
  });

  it('attacks for a single click on the floor once the double click has had its chance', () => {
    const { world, play, step, screenX, click } = setup();
    click(screenX(world.player.centerX) - 50, FLOOR_Y);
    expect(world.loadout.fired).toBe(0);
    step(Math.ceil(DOUBLE_CLICK_SECONDS * 60));
    expect(world.loadout.fired).toBe(1);
    expect(world.player.facing).toBe(-1);
    expect(play.walking).toBe(false);
  });

  it('fires once, not twice, for a double click anywhere a walk cannot go', () => {
    const { world, play, step, screenX, doubleClick } = setup();
    doubleClick(screenX(world.player.centerX) + 70, SKY_Y);
    step(40);
    expect(world.loadout.fired).toBe(1);
    expect(play.walking).toBe(false);
  });

  it('jumps by itself onto a double-clicked girder and across the pit before it', () => {
    const { world, step, screenX, doubleClick } = setup();
    // Luna's first girder (columns 36–39) stands past a two-tile pit (columns 32–33).
    world.player.respawn(470, GROUND_Y, world.time);
    step(30);
    const girderTop = 152;
    let jumped = false;
    doubleClick(screenX(600), girderTop + 4);
    for (let frame = 0; frame < 180; frame++) {
      step(1);
      if (!world.player.grounded) jumped = true;
    }
    expect(jumped).toBe(true);
    expect(world.player.feet).toBe(girderTop);
    expect(Math.abs(world.player.centerX - 600)).toBeLessThan(3);
  });

  it('stops a walk for a new click, and sends it elsewhere for a new double click', () => {
    const { world, play, step, screenX, click, doubleClick, arrive } = setup();
    const start = world.player.centerX;
    doubleClick(screenX(start + 200), FLOOR_Y);
    step(20);
    expect(play.walking).toBe(true);
    click(screenX(world.player.centerX) + 40, SKY_Y);
    expect(play.walking).toBe(false);
    const stoppedAt = world.player.centerX;
    step(30);
    expect(Math.abs(world.player.centerX - stoppedAt)).toBeLessThan(6);
    doubleClick(screenX(start - 20), FLOOR_Y);
    arrive();
    expect(Math.abs(world.player.centerX - (start - 20))).toBeLessThan(3);
  });

  it('head-butts a double-clicked "?" block', () => {
    const { world, step, screenX, doubleClick } = setup();
    const block = world.blocks[0];
    if (!block) throw new Error('no block');
    world.player.respawn(block.rect.x - 60, GROUND_Y, world.time);
    step(30);
    doubleClick(screenX(block.rect.x + 8), block.rect.y + 8);
    step(150);
    expect(block.used).toBe(true);
  });

  it('leaves a finger on the picture alone: the touch pad plays a touch screen', () => {
    const { world, play, mouse, step, screenX, doubleClick } = setup();
    mouse.kind = 'touch';
    doubleClick(screenX(world.player.centerX) + 90, FLOOR_Y);
    step(40);
    expect(play.walking).toBe(false);
    expect(world.loadout.fired).toBe(0);
    expect(play.cursor).toBe('hand');
  });

  it('names the cursor for what a click or double click would do, and which way', () => {
    const { world, play, mouse, step, screenX } = setup();
    const hero = screenX(world.player.centerX);
    const at = (x: number, y: number) => {
      mouse.move(x, y);
      step(1);
      return play.cursor;
    };
    expect(at(hero + 80, SKY_Y)).toBe('attack-right');
    expect(at(hero - 30, SKY_Y)).toBe('attack-left');
    expect(at(hero + 80, FLOOR_Y)).toBe('walk-right');
    expect(at(hero - 30, FLOOR_Y)).toBe('walk-left');
    // Luna's first "?" block: a jump to head-butt it.
    const block = world.blocks[0];
    if (!block) throw new Error('no block');
    world.player.respawn(block.rect.x - 100, GROUND_Y, world.time);
    step(30);
    expect(at(screenX(block.rect.x + 8), block.rect.y + 8)).toBe('jump-right');
  });
});
