import type { RenderKit } from '../../../entities/RenderKit';
import type { CasterSnapshot } from '../../../skills/SkillVisual';
import type { World } from '../../../world/World';

/** The hero as skill visuals see it this frame: the caster, plus its look's anchors placed in the world. */
export function casterSnapshot(world: World, kit: RenderKit): CasterSnapshot {
  const { player } = world;
  const { sheet } = kit.looks.characters[player.characterId];
  const { animation, time } = player.pose(kit.time);
  const place = (name: string) => {
    const point = sheet.anchor(animation, name, time);
    return point && sheet.toScreen(point, player.centerX, player.feet, player.facing < 0);
  };
  return { ...world.caster, hand: place('hand'), muzzle: place('muzzle'), height: sheet.height };
}
