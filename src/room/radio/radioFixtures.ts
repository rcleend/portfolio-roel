import { Box3, Vector3 } from 'three';
import type { RadioFramingModel } from './radioFraming';

/**
 * The radio's bounds (RADIO_SPEC.bodyBounds, gen/props/radioSpec.ts) and the lava lamp's glass and base, for tests:
 * the numbers `radioModelOf` hands the room at runtime.
 */
export const RADIO_FIXTURE: RadioFramingModel = {
  facing: new Vector3(0, 0, 1),
  bodyBounds: new Box3(new Vector3(0.735, 0.887, -2.205), new Vector3(1.295, 1.087, -1.865)),
  lampBounds: new Box3(new Vector3(0.426, 1.102, -2.034), new Vector3(0.554, 1.306, -1.906)),
};

/** The viewports of the radio's framing table (docs/ROOM.md › The CD player), with the app's control insets. */
export const RADIO_VIEWPORTS = [
  { width: 2560, height: 1440, bottom: 0, right: 0 },
  { width: 3440, height: 1440, bottom: 0, right: 0 },
  { width: 1920, height: 1080, bottom: 0, right: 0 },
  { width: 1440, height: 900, bottom: 0, right: 0 },
  { width: 1366, height: 768, bottom: 0, right: 0 },
  { width: 1280, height: 720, bottom: 0, right: 0 },
  { width: 1024, height: 768, bottom: 0, right: 0 },
  { width: 820, height: 1180, bottom: 64, right: 0 },
  { width: 768, height: 1024, bottom: 64, right: 0 },
  { width: 844, height: 390, bottom: 0, right: 64 },
  { width: 667, height: 375, bottom: 0, right: 64 },
  { width: 390, height: 844, bottom: 64, right: 0 },
  { width: 375, height: 667, bottom: 64, right: 0 },
  { width: 360, height: 640, bottom: 64, right: 0 },
] as const;
