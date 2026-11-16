import { defineCustomerLook } from '@/game/art/looks/module';
import { art as sheetArt } from './sheet.art';
import sheetJson from './sheet.json';

/** Portrait Unhappy Customer: his `stunned` animation draws its own dizzy stars. */
export const look = defineCustomerLook({ sheet: { art: sheetArt, json: sheetJson } });
