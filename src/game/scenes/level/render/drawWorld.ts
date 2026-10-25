import type { Gfx } from '@/engine/gfx/Gfx';
import type { LabelLayout } from '../../../entities/customer/label';
import { drawCustomerLabels, renderCustomer } from '../../../entities/customer/renderCustomer';
import type { RenderKit } from '../../../entities/RenderKit';
import { runningElixir } from '../../../skills/uxElixir';
import type { World } from '../../../world/World';
import { casterSnapshot } from './casterSnapshot';

/**
 * Draws every entity in world space, back to front: stage props, the few
 * customer labels that meet a character, auras behind the hero, customers
 * (happy ones behind angry ones), the hero, shots, bubbles, beams in front,
 * effects, and finally the scope-creep vines that tangle around the player's
 * legs. Of the customers' labels laid out in `labels` it draws those that
 * meet a character; the stage draws the rest over its foreground.
 */
export function drawWorld(gfx: Gfx, world: World, kit: RenderKit, labels: LabelLayout): void {
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
  const rules = { customersCalm: world.modifiers.customersCalm, elixir: runningElixir(world.activeSkills) };
  drawCustomerLabels(gfx, kit, labels, 'behind');
  for (const skill of world.activeSkills) skill.render(gfx, kit, caster, 'behind');
  for (const customer of world.customers) if (customer.won) renderCustomer(gfx, kit, customer, rules);
  for (const customer of world.customers) if (!customer.won) renderCustomer(gfx, kit, customer, rules);
  if (world.playerVisible) world.player.render(gfx, kit);
  for (const shot of world.shots) shot.render(gfx, kit);
  for (const bubble of world.bubbles) bubble.render(gfx, kit);
  for (const skill of world.activeSkills) skill.render(gfx, kit, caster, 'front');
  world.feedback.effects.render(gfx, kit);

  const vines = prop(theme.slowZone?.prop);
  if (vines) for (const zone of world.slowZones) zone.render(gfx, vines, kit.time);
}
