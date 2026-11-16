import { defineCustomerLook } from '@/game/art/looks/module';
import { art as sheetArt } from './sheet.art';
import sheetJson from './sheet.json';

/** The arcade Unhappy Customer, drawn by tools/looks/arcade/characters; `stunned` draws its own stars. */
export const look = defineCustomerLook({ sheet: { art: sheetArt, json: sheetJson } });
