import { defineSkillLook } from '@/game/art/looks/module';
import { art as iconArt } from './icon.art';
import iconJson from './icon.json';

/** Hibit power-chord: the icon; the effect strips here are drawn but not wired yet, so classic plays the effect. */
export const look = defineSkillLook('power-chord', { icon: { art: iconArt, json: iconJson } });
