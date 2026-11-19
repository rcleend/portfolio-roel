import { ControlsLayer } from './ControlsLayer';
import { createRadioDevice } from './device/RadioDevice';
import { type DeviceLoader, RadioDeckHandle } from './RadioDeckHandle';

/**
 * The radio's lazy chunk (`radioDevice` in bundle-budgets.json): the deck the app drives and the device it makes.
 * RadioDoor imports it as the camera first leaves the TV, so it is there before the radio can be asked for; the
 * device itself (its textures and programs) is made on a prefetch or the way to the radio. One chunk,
 * not a deck chunk and a device chunk: both would share three.js with the room chunk, and Rolldown would then move
 * three.js out of the room chunk into a chunk of its own, costing the first load more than the deck saves.
 */
export function createRadioDeck(container: HTMLElement, reducedMotion: MediaQueryList): RadioDeckHandle {
  return new RadioDeckHandle(new ControlsLayer(container), reducedMotion, loadDevice);
}

/** The device: it needs no file, its parts are built with the room. */
const loadDevice: DeviceLoader = (host, link) => createRadioDevice(host, link);
