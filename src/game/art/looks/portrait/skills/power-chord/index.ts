import { defineSkillLook } from '@/game/art/looks/module';
import { art as iconArt } from './icon.art';
import iconJson from './icon.json';

/** Portrait POWER CHORD: the icon (docs/looks/portrait-skills.md). The effect strips are drawn but not wired yet, so play stays classic's. */
export const look = defineSkillLook('power-chord', { icon: { art: iconArt, json: iconJson } });
