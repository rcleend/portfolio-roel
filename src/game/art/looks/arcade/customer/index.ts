import { defineCustomerLook } from '@/game/art/looks/module';
import sheetJson from './sheet.json';
import sheetPng from './sheet.png';

/** The arcade Unhappy Customer, drawn by tools/looks/arcade/characters; `stunned` draws its own stars. */
export const look = defineCustomerLook({ sheet: { png: sheetPng, json: sheetJson } });
