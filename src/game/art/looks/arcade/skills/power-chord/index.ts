import { defineSkillLook } from '@/game/art/looks/module';
import iconJson from './icon.json';
import iconPng from './icon.png';

/**
 * The arcade POWER CHORD icon, drawn by tools/looks/arcade/skills. The effect
 * strips beside it are not wired yet (docs/looks/arcade-skills.md), so the
 * skill's visual stays classic's.
 */
export const look = defineSkillLook('power-chord', { icon: { png: iconPng, json: iconJson } });
