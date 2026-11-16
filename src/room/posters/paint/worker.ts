import { atlasSize, paintAtlas } from './atlas';

/** What the wall asks its painter for: the tier's scale, and the faces to set the type in (absolute URLs). */
export interface PaintRequest {
  readonly scale: number;
  readonly faces: readonly (readonly [family: string, weight: string, url: string])[];
}

/** The atlas as a bitmap, or null where it could not be painted here (the wall then paints it itself). */
export type PaintReply = ImageBitmap | null;

interface WorkerScope {
  readonly fonts: FontFaceSet;
  onmessage: ((event: MessageEvent<PaintRequest>) => void) | null;
  postMessage(message: PaintReply, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

/**
 * The posters' painter: the whole atlas on an OffscreenCanvas, so not one frame of the game on the TV pays for it,
 * however slow the phone. A face that will not load is set in its fallback.
 */
scope.onmessage = async ({ data: { scale, faces } }) => {
  let bitmap: PaintReply = null;
  try {
    await Promise.all(
      faces.map(([family, weight, url]) =>
        new FontFace(family, `url(${url})`, { weight }).load().then(
          (face) => scope.fonts.add(face),
          () => {},
        ),
      ),
    );
    const canvas = new OffscreenCanvas(...atlasSize(scale));
    for (const _unit of paintAtlas(canvas, scale, false));
    bitmap = canvas.transferToImageBitmap();
  } catch {
    bitmap = null;
  }
  scope.postMessage(bitmap, bitmap ? [bitmap] : []);
};
