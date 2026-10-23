import { defineSkillLook } from '@/game/art/looks/module';
import iconJson from './icon.json';
import iconPng from './icon.png';

/** Hibit churn-shield: the icon; the effect strips here are drawn but not wired yet, so classic plays the effect. */
export const look = defineSkillLook('churn-shield', { icon: { png: iconPng, json: iconJson } });
