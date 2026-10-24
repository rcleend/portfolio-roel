import { ControlsLayer } from './ControlsLayer';
import { createRadioDevice } from './device/RadioDevice';
import { CLOSEUP_FILE } from './deviceContract';
import { type DeviceLoader, RadioDeckHandle } from './RadioDeckHandle';

/**
 * The radio's lazy chunk (`radioDevice` in bundle-budgets.json): the deck the app drives and the device it makes.
 * RadioDoor imports it as the camera first leaves the TV, so it is there before the radio can be asked for; the
 * device itself (the close-up, its textures and programs) is made on a prefetch or the way to the radio. One chunk,
 * not a deck chunk and a device chunk: both would share three.js with the room chunk, and Rolldown would then move
 * three.js out of the room chunk into a chunk of its own, costing the first load more than the deck saves.
 */
export function createRadioDeck(container: HTMLElement, reducedMotion: MediaQueryList): RadioDeckHandle {
  return new RadioDeckHandle(new ControlsLayer(container), reducedMotion, loadDevice);
}

/** The device, its close-up downloading as it starts. */
const loadDevice: DeviceLoader = (host, link) => {
  const closeUp = fetchCloseUp(new URL(CLOSEUP_FILE, host.assetBaseUrl).href);
  // Its failure is the device's to report, once it asks for it.
  closeUp.catch(() => undefined);
  return createRadioDevice(host, { ...link, closeUp });
};

async function fetchCloseUp(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}
