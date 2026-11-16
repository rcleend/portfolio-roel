import { defineSkillLook } from '@/game/art/looks/module';
import { art as iconArt } from './icon.art';
import iconJson from './icon.json';

/** Hibit north-star: the icon; the effect strips here are drawn but not wired yet, so classic plays the effect. */
export const look = defineSkillLook('north-star', { icon: { art: iconArt, json: iconJson } });
