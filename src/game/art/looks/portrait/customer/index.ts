import { defineCustomerLook } from '@/game/art/looks/module';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/** Portrait Unhappy Customer: his `stunned` animation draws its own dizzy stars. */
export const look = defineCustomerLook({ sheet: { png: sheetPng, json: sheetJson } });
