import type { Viewpoint } from '../camera/cameraPath';
import { type PagePoint, type PageViewport, projectToPage } from '../camera/pageProjection';
import { type GlassPlane, planeCorners, planeWidth } from './glassPlane';
import type { ScreenRect } from './PcMonitor';

/**
 * Where a display's picture lands on the page when the camera rests at `viewpoint`: the
 * rectangle a flat DOM element must cover to replace the WebGL picture pixel for pixel.
 */
export interface Placement {
  /** In the room container's CSS pixels, edges snapped to device pixels. */
  readonly rect: ScreenRect;
  /** The picture's corner radius in CSS pixels. */
  readonly radius: number;
  /**
   * How far (CSS px) the projected corners are from an axis-aligned rectangle. Zero for a camera
   * looking straight at the glass; anything visible means the asset turned and a 2D element can
   * no longer cover the picture exactly.
   */
  readonly skew: number;
}

export function screenPlacement(
  picture: GlassPlane,
  radius: number,
  viewpoint: Viewpoint,
  viewport: PageViewport,
  devicePixelRatio: number,
): Placement {
  const [topLeft, topRight, bottomLeft, bottomRight] = projectToPage(planeCorners(picture), viewpoint, viewport) as [
    PagePoint,
    PagePoint,
    PagePoint,
    PagePoint,
  ];
  const skew = Math.max(
    Math.abs(topLeft.x - bottomLeft.x),
    Math.abs(topRight.x - bottomRight.x),
    Math.abs(topLeft.y - topRight.y),
    Math.abs(bottomLeft.y - bottomRight.y),
  );
  // The page's own ratio, not the room's capped one: the DOM is rasterised at full resolution,
  // and edges on device pixels keep the screen's text and glass finish crisp.
  const snap = (value: number): number => Math.round(value * devicePixelRatio) / devicePixelRatio;
  const left = snap((topLeft.x + bottomLeft.x) / 2);
  const right = snap((topRight.x + bottomRight.x) / 2);
  const top = snap((topLeft.y + topRight.y) / 2);
  const bottom = snap((bottomLeft.y + bottomRight.y) / 2);
  const width = right - left;
  return {
    rect: { left, top, width, height: bottom - top },
    radius: radius * (width / planeWidth(picture)),
    skew,
  };
}
