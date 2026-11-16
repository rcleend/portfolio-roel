import { defineSkillLook } from '@/game/art/looks/module';
import { art as iconArt } from './icon.art';
import iconJson from './icon.json';

/**
 * The arcade NORTH STAR icon, drawn by tools/looks/arcade/skills. The effect
 * strips beside it are not wired yet (docs/looks/arcade-skills.md), so the
 * skill's visual stays classic's.
 */
export const look = defineSkillLook('north-star', { icon: { art: iconArt, json: iconJson } });
