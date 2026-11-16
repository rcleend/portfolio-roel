import { defineSkillLook } from '@/game/art/looks/module';
import { art as iconArt } from './icon.art';
import iconJson from './icon.json';

/** Hibit churn-shield: the icon; the effect strips here are drawn but not wired yet, so classic plays the effect. */
export const look = defineSkillLook('churn-shield', { icon: { art: iconArt, json: iconJson } });
