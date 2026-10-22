import type { Gfx } from '@/engine/gfx/Gfx';
import { renderCustomer } from '../../../entities/customer/renderCustomer';
import type { RenderKit } from '../../../entities/RenderKit';
import type { World } from '../../../world/World';
import { casterSnapshot } from './casterSnapshot';

/**
 * Draws every entity in world space, back to front: stage props, auras
 * behind the hero, customers (happy ones behind angry ones), the hero,
 * shots, bubbles, beams in front, effects, and finally the scope-creep vines
 * that tangle around the player's legs.
 */
export function drawWorld(gfx: Gfx, world: World, kit: RenderKit): void {
  const { props } = kit.art;
  const { theme } = world.stage;
  const prop = (name: string | undefined) => (name === undefined ? undefined : props[name]);

  const mover = prop(theme.mover.prop);
  if (mover) for (const vehicle of world.movers) vehicle.render(gfx, mover);
  const barrier = prop(theme.barrier?.prop);
  if (barrier) for (const fence of world.barriers) fence.render(gfx, barrier);
  const gate = prop(theme.gate?.prop);
  if (gate) for (const entry of world.gates) entry.render(gfx, gate, kit.time);
  for (const checkpoint of world.checkpoints) checkpoint.render(gfx, kit.time);
  for (const block of world.blocks) block.render(gfx, kit.art.tileset, kit.time);
  world.goalFlag?.render(gfx, kit.text.label, kit.time);

  const caster = casterSnapshot(world, kit);
  for (const skill of world.activeSkills) skill.render(gfx, kit, caster, 'behind');
  for (const customer of world.customers) if (customer.won) renderCustomer(gfx, kit, customer, world.modifiers);
  for (const customer of world.customers) if (!customer.won) renderCustomer(gfx, kit, customer, world.modifiers);
  if (world.playerVisible) world.player.render(gfx, kit);
  for (const shot of world.shots) shot.render(gfx, kit);
  for (const bubble of world.bubbles) bubble.render(gfx, kit);
  for (const skill of world.activeSkills) skill.render(gfx, kit, caster, 'front');
  world.feedback.effects.render(gfx, kit);

  const vines = prop(theme.slowZone?.prop);
  if (vines) for (const zone of world.slowZones) zone.render(gfx, vines, kit.time);
}
