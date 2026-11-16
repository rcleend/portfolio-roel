import { defineSkillLook } from '@/game/art/looks/module';
import { art as iconArt } from './icon.art';
import iconJson from './icon.json';

/** Hibit ux-elixir: the icon; the effect strips here are drawn but not wired yet, so classic plays the effect. */
export const look = defineSkillLook('ux-elixir', { icon: { art: iconArt, json: iconJson } });
