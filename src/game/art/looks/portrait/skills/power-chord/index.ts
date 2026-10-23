import { defineSkillLook } from '@/game/art/looks/module';
import iconJson from './icon.json';
import iconPng from './icon.png';

/** Portrait POWER CHORD: the icon (docs/looks/portrait-skills.md). The effect strips are drawn but not wired yet, so play stays classic's. */
export const look = defineSkillLook('power-chord', { icon: { png: iconPng, json: iconJson } });
