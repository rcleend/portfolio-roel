import { heroAnimation, skillPose } from '../../../art/looks/contracts';
import type { RenderKit } from '../../../entities/RenderKit';
import type { CasterSnapshot } from '../../../skills/SkillVisual';
import type { World } from '../../../world/World';

/** The hero as skill visuals see it this frame: the caster, plus its look's anchors placed in the world. */
export function casterSnapshot(world: World, kit: RenderKit): CasterSnapshot {
  const { player } = world;
  const { sheet } = kit.looks.characters[player.characterId];
  const { animation, skill, time } = player.pose(kit.time);
  const shown = heroAnimation(sheet, animation, skill);
  const place = (name: string) => {
    const point = sheet.anchor(shown, name, time);
    return point && sheet.toScreen(point, player.centerX, player.feet, player.facing < 0);
  };
  return {
    ...world.caster,
    hand: place('hand'),
    muzzle: place('muzzle'),
    anchor: place,
    height: sheet.height,
    posesOwn: (own) => sheet.has(skillPose(own)),
  };
}
