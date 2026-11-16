import { buildScene, type GenRequest, transferables } from './scene';

/** The generators' worker: geometry is arithmetic, so a slow phone's main thread never spends a frame on it. */
self.onmessage = (event: MessageEvent<GenRequest>) => {
  const scene = buildScene(event.data);
  (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(
    scene,
    transferables(scene),
  );
};
